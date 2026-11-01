
import os
import asyncio
from pathlib import Path

import httpx2
from dotenv import load_dotenv
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

# Load environment variables
ROOT = Path(__file__).resolve().parents[3]
load_dotenv(ROOT / ".env")

GITHUB_MCP_URL = "https://api.githubcopilot.com/mcp/"


async def main():
    token = os.getenv("GITHUB_TOKEN")
    owner = os.getenv("GITHUB_OWNER")
    repo = os.getenv("GITHUB_REPO")
    pr_number = int(os.getenv("GITHUB_PR_NUMBER", "1"))

    if not token:
        raise RuntimeError("GITHUB_TOKEN missing in .env")

    if not owner or not repo:
        raise RuntimeError("GITHUB_OWNER or GITHUB_REPO missing")

    headers = {
        "Authorization": f"Bearer {token}",
        "X-MCP-Toolsets": "repos,pull_requests,actions",
        "X-MCP-Readonly": "true",
    }

    timeout = httpx2.Timeout(30.0, read=300.0)

    async with httpx2.AsyncClient(
        headers=headers,
        timeout=timeout,
    ) as http_client:

        transport = streamable_http_client(
            GITHUB_MCP_URL,
            http_client=http_client,
        )

        # Keep every MCP operation inside this block
        async with Client(transport, mode="legacy") as client:

            print("Connected to GitHub MCP!\n")

            # Step 1: Discover available tools
            tools = await client.list_tools()

            print(f"Available tools: {len(tools.tools)}\n")

            for tool in tools.tools:
                print("-", tool.name)

            available = {tool.name for tool in tools.tools}

            if "pull_request_read" not in available:
                print("pull_request_read tool is unavailable.")
                return

            # Step 2: Retrieve PR details
            for method in ("get", "get_files", "get_check_runs"):

                print(f"\n--- Fetching: {method} ---")

                try:
                    result = await client.call_tool(
                        "pull_request_read",
                        {
                            "owner": owner,
                            "repo": repo,
                            "pullNumber": pr_number,
                            "method": method,
                        },
                    )

                    if result.is_error:
                        print("GitHub MCP tool error:")
                        print(result.content)
                        continue

                    if result.structured_content is not None:
                        print(result.structured_content)
                    else:
                        for item in result.content:
                            if hasattr(item, "text"):
                                print(item.text[:8000])

                except Exception as error:
                    print(
                        f"Failed to retrieve {method}: "
                        f"{type(error).__name__}: {error}"
                    )


if __name__ == "__main__":
    asyncio.run(main())
