
import json

from app.services.github_service import call_github_tool


async def collect_repository_context(
    client,
    owner: str,
    repo: str,
    commit_sha: str,
):
    """Collect repository evidence at the failed commit."""

    paths = [
        "",
        ".github/workflows/python-tests.yml",
        "requirements.txt",
        "pyproject.toml",
        "pytest.ini",
        "devpilot-ai/backend/test_mcp.py",
    ]

    context = {
        "commit_sha": commit_sha,
        "files": {},
    }

    for path in paths:
        try:
            result = await call_github_tool(
                client,
                "get_file_contents",
                {
                    "owner": owner,
                    "repo": repo,
                    "path": path,
                    "ref": commit_sha,
                },
            )

            # Retain returned metadata as well as content.
            serialized = json.dumps(
                result,
                ensure_ascii=False,
                default=str,
            )

            context["files"][path or "(root)"] = (
                serialized[:12000]
            )

            print(f"Retrieved repository context: {path or '(root)'}")

        except Exception as error:
            context["files"][path or "(root)"] = {
                "status": "unavailable",
                "reason": str(error)[:300],
            }

    return context
