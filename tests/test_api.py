
import os
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

# Configure the test repository before loading the API.
os.environ["GITHUB_OWNER"] = "jwerr"
os.environ["GITHUB_REPO"] = "MCP_Server"

from app.main import app


client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_openapi_documentation():
    response = client.get("/openapi.json")

    assert response.status_code == 200

    paths = response.json()["paths"]

    assert "/api/review-pr" in paths
    assert "/api/analyze-ci" in paths
    assert "/api/reports" in paths


def test_pr_request_validation():
    response = client.post(
        "/api/review-pr",
        json={
            "owner": "jwerr",
            "repo": "MCP_Server",
            "pull_number": -1,
        },
    )

    assert response.status_code == 422


def test_repository_access_restriction():
    response = client.post(
        "/api/review-pr",
        json={
            "owner": "another-user",
            "repo": "another-repo",
            "pull_number": 1,
        },
    )

    assert response.status_code == 403


def test_ci_run_id_validation():
    response = client.post(
        "/api/analyze-ci",
        json={
            "owner": "jwerr",
            "repo": "MCP_Server",
            "run_id": 0,
        },
    )

    assert response.status_code == 422


def test_report_not_found():
    response = client.get("/api/reports/999999999")

    assert response.status_code == 404


def test_pr_review_with_mocked_mcp_and_llm():
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def fake_mcp():
        yield object()

    async def fake_github_tool(client, name, arguments):
        if arguments["method"] == "get":
            return {"title": "Test pull request"}

        if arguments["method"] == "get_files":
            return [
                {
                    "filename": "calculator.py",
                    "status": "modified",
                    "patch": "@@ -1 +1 @@",
                }
            ]

        raise AssertionError("Unexpected GitHub tool call")

    fake_graph_result = {
        "review": {
            "summary": "No critical issues found",
            "findings": [],
            "overall_risk": "low",
        }
    }

    with (
        patch("app.main.github_mcp", fake_mcp),
        patch(
            "app.main.call_github_tool",
            side_effect=fake_github_tool,
        ),
        patch(
            "app.main.review_graph.ainvoke",
            new_callable=AsyncMock,
        ) as mock_graph,
        patch("app.main.save_report", return_value=123),
    ):
        mock_graph.return_value = fake_graph_result

        response = client.post(
            "/api/review-pr",
            json={
                "owner": "jwerr",
                "repo": "MCP_Server",
                "pull_number": 1,
            },
        )

    assert response.status_code == 200
    assert response.json()["report_id"] == 123
    assert response.json()["review"]["overall_risk"] == "low"
