
import asyncio
from mcp import Client
from mcp_servers.docs_server import mcp

async def main():
    async with Client(mcp) as client:
        tools = await client.list_tools()
        print("Available tools:", [t.name for t in tools.tools])

        result = await client.call_tool(
            "search_documentation",
            {"query": "testing"}
        )
        print("Result:", result)

if __name__ == "__main__":
    asyncio.run(main())
