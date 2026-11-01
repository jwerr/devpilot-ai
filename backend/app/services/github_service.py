
import json
import os
from contextlib import asynccontextmanager

import httpx2
from dotenv import load_dotenv
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

load_dotenv()

GITHUB_MCP_URL = "https://api.githubcopilot.com/mcp/"


def decode_result(result):
    if result.is_error:
        raise RuntimeError(str(result.content))

    if result.structured_content is not None:
        return result.structured_content

    texts = [
        block.text
        for block in result.content
        if hasattr(block, "text")
    ]

    if not texts:
        raise RuntimeError("Empty GitHub MCP response")

    try:
        return json.loads(texts[0])
    except json.JSONDecodeError:
        return {"text": "\n".join(texts)}


@asynccontextmanager
async def github_mcp():
    token = os.getenv("GITHUB_TOKEN")

    if not token:
        raise RuntimeError("GITHUB_TOKEN is missing")

    headers = {
        "Authorization": f"Bearer {token}",
        "X-MCP-Toolsets": "repos,pull_requests,actions",
        "X-MCP-Readonly": "true",
    }

    async with httpx2.AsyncClient(
        headers=headers,
        timeout=httpx2.Timeout(30, read=300),
    ) as http_client:
        transport = streamable_http_client(
            GITHUB_MCP_URL,
            http_client=http_client,
        )

        async with Client(
            transport,
            mode="legacy"
        ) as client:
            yield client


async def call_github_tool(client, tool_name, arguments):
    result = await client.call_tool(
        tool_name,
        arguments
    )
    return decode_result(result)
