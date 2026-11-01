
from mcp.server import MCPServer

mcp = MCPServer("DevPilot Documentation Server")

DOCUMENTATION = {
    "setup": (
        "Install dependencies, configure environment variables, "
        "then start the FastAPI application."
    ),
    "testing": (
        "Run pytest before opening a pull request. "
        "All required tests must pass."
    ),
    "deployment": (
        "Build a Docker image and deploy only after "
        "CI checks succeed."
    ),
}

@mcp.tool()
def search_documentation(query: str) -> str:
    """Search project documentation by keyword."""
    query = query.strip().lower()

    if not query:
        return "Please provide a search query."

    matches = [
        f"{topic}: {content}"
        for topic, content in DOCUMENTATION.items()
        if query in topic or query in content.lower()
    ]

    return "\n".join(matches) if matches else "No matching documentation."

if __name__ == "__main__":
    mcp.run(transport="stdio")
