
import asyncio
import json
import os
import sys
from pathlib import Path

import httpx2
from dotenv import load_dotenv
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "backend"))

from app.agents.review_agent import review_graph

load_dotenv(ROOT / ".env")


def decode_result(result):
    if result.is_error:
        raise RuntimeError(f"MCP error: {result.content}")

    if result.structured_content is not None:
        return result.structured_content

    for item in result.content:
        if hasattr(item, "text"):
            return json.loads(item.text)

    raise RuntimeError("No JSON data returned by MCP")


async def main():
    token = os.environ["GITHUB_TOKEN"]
    owner = os.environ["GITHUB_OWNER"]
    repo = os.environ["GITHUB_REPO"]
    pr_number = int(os.environ["GITHUB_PR_NUMBER"])

    headers = {
        "Authorization": f"Bearer {token}",
        "X-MCP-Toolsets": "repos,pull_requests,actions",
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

        async with Client(
            transport, mode="legacy"
        ) as mcp_client:

            async def fetch_pr(method):
                result = await mcp_client.call_tool(
                    "pull_request_read",
                    {
                        "owner": owner,
                        "repo": repo,
                        "pullNumber": pr_number,
                        "method": method,
                    },
                )
                return decode_result(result)

            print("Fetching pull request...")
            pr = await fetch_pr("get")

            print("Fetching changed files...")
            files = await fetch_pr("get_files")

    # The MCP connection has safely closed.
    # Now execute the AI review workflow.
    print("Running AI code review...\n")

    result = await review_graph.ainvoke(
        {
            "pr_title": pr["title"],
            "files": files,
            "review": "",
        }
    )

    print("=== DEVPILOT AI REVIEW ===\n")
    print(json.dumps(result["review"], indent=2))

if __name__ == "__main__":
    asyncio.run(main())
