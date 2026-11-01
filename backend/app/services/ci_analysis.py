
import os
import sys
import json
import asyncio
from pathlib import Path

import httpx2
from dotenv import load_dotenv
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

# Add backend directory to Python path
sys.path.insert(
    0,
    str(Path(__file__).resolve().parents[2])
)

from app.agents.ci_agent import ci_graph

# Load environment variables
ROOT = Path(__file__).resolve().parents[3]
load_dotenv(ROOT / ".env")



def decode(result):
    if result.is_error:
        raise RuntimeError(str(result.content))

    if result.structured_content is not None:
        return result.structured_content

    texts = [
        item.text
        for item in result.content
        if hasattr(item, "text")
    ]

    if not texts:
        return {}

    try:
        return json.loads(texts[0])
    except json.JSONDecodeError:
        return {"text": "\n".join(texts)}


async def main():
    token = os.environ["GITHUB_TOKEN"]
    owner = os.environ["GITHUB_OWNER"]
    repo = os.environ["GITHUB_REPO"]

    headers = {
        "Authorization": f"Bearer {token}",
        "X-MCP-Toolsets": "actions",
        "X-MCP-Readonly": "true",
    }

    async with httpx2.AsyncClient(
        headers=headers,
        timeout=httpx2.Timeout(30.0, read=300.0),
    ) as http_client:

        transport = streamable_http_client(
            "https://api.githubcopilot.com/mcp/",
            http_client=http_client,
        )

        async with Client(transport, mode="legacy") as client:
            tools = await client.list_tools()
            names = {tool.name for tool in tools.tools}

            print("Available Actions tools:", sorted(names))

            if "actions_list" not in names:
                raise RuntimeError("actions_list is unavailable")

            result = await client.call_tool(
                "actions_list",
                {
                    "method": "list_workflow_runs",
                    "owner": owner,
                    "repo": repo,
                    "perPage": 10,
                },
            )

            runs_data = decode(result)
            print("\nWorkflow runs:")
            print(json.dumps(runs_data, indent=2)[:10000])

            # Find historical failed runs
            runs = runs_data.get("workflow_runs", [])

            failed_runs = [
                run for run in runs
                if run.get("conclusion") == "failure"
            ]

            print(f"\nFound {len(failed_runs)} failed runs")

            if not failed_runs:
                print("No failed runs found.")
                return

            # Select the newest failed workflow
            failed_run = failed_runs[0]
            run_id = failed_run["id"]

            print(f"\nInvestigating workflow run: {run_id}")
            print(f"Branch: {failed_run['head_branch']}")

            # Retrieve logs through GitHub MCP
            logs_result = await client.call_tool(
                "get_job_logs",
                {
                    "owner": owner,
                    "repo": repo,
                    "run_id": run_id,
                    "failed_only": True,
                    "return_content": True,
                    "tail_lines": 200,
                },
            )

            logs_data = decode(logs_result)

            print("\n=== FAILED JOB LOGS ===")

            if "logs" in logs_data:
                for job in logs_data["logs"]:
                    print("\nJob:", job.get("job_name"))
                    print(job.get("logs_content", "No log content"))
            else:
                print(json.dumps(logs_data, indent=2)[:15000])

            # Convert retrieved logs to text
            logs_text = json.dumps(logs_data, indent=2)

            # Analyze the logs with LangGraph
            print("\nRunning AI root-cause analysis...")

            analysis = await ci_graph.ainvoke(
                {
                    "run_id": run_id,
                    "logs": logs_text,
                    "report": {},
                }
            )

            print("\n=== DEVPILOT AI CI REPORT ===")

            print(
                json.dumps(
                    analysis["report"],
                    indent=2,
                )
            )




if __name__ == "__main__":
    asyncio.run(main())
