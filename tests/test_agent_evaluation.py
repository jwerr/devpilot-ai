
import asyncio
import json
from unittest.mock import MagicMock, patch

from app.agents.multi_tool_agent import build_multi_tool_agent


def setup_agent():
    """
    Build the agent and capture its registered tools,
    without creating a real LLM connection.
    """
    captured = {}

    def fake_create_agent(*args, **kwargs):
        captured["tools"] = kwargs["tools"]
        return MagicMock()

    with (
        patch("app.agents.multi_tool_agent.ChatOpenAI"),
        patch(
            "app.agents.multi_tool_agent.create_agent",
            side_effect=fake_create_agent,
        ),
    ):
        agent, audit = build_multi_tool_agent(
            MagicMock(),
            "jwerr",
            "MCP_Server",
        )

    tools = {
        item.name: item
        for item in captured["tools"]
    }

    return agent, audit, tools


def run_tool(tool, arguments):
    return asyncio.run(tool.ainvoke(arguments))


def test_six_read_only_tools_registered():
    _, audit, tools = setup_agent()

    assert set(tools) == {
        "get_pull_request",
        "get_pr_files",
        "get_pr_checks",
        "list_ci_runs",
        "get_ci_logs",
        "read_repository_file",
    }

    assert audit == []


def test_pull_request_tool_routes_correctly():
    _, audit, tools = setup_agent()

    async def fake_call(client, name, arguments):
        return {
            "number": 1,
            "title": "Calculator test PR",
        }

    with patch(
        "app.agents.multi_tool_agent.call_github_tool",
        side_effect=fake_call,
    ):
        output = run_tool(
            tools["get_pull_request"],
            {"pull_number": 1},
        )

    assert "Calculator test PR" in output
    assert audit[0]["tool"] == "pull_request_read"
    assert audit[0]["arguments"]["method"] == "get"
    assert audit[0]["arguments"]["owner"] == "jwerr"


def test_ci_logs_tool_routes_correctly():
    _, audit, tools = setup_agent()

    async def fake_call(client, name, arguments):
        return {
            "text": (
                "ModuleNotFoundError: "
                "No module named 'mcp'"
            )
        }

    with patch(
        "app.agents.multi_tool_agent.call_github_tool",
        side_effect=fake_call,
    ):
        output = run_tool(
            tools["get_ci_logs"],
            {"run_id": 41312676761},
        )

    assert "ModuleNotFoundError" in output
    assert audit[0]["tool"] == "get_job_logs"
    assert audit[0]["arguments"]["run_id"] == 41312676761
    assert audit[0]["arguments"]["failed_only"] is True


def test_path_traversal_is_rejected():
    _, audit, tools = setup_agent()

    output = run_tool(
        tools["read_repository_file"],
        {
            "path": "../private/.env",
            "ref": "",
        },
    )

    assert "Invalid repository path" in output
    assert len(audit) == 0


def test_invalid_run_id_is_rejected():
    _, audit, tools = setup_agent()

    output = run_tool(
        tools["get_ci_logs"],
        {"run_id": -1},
    )

    assert "Invalid workflow run ID" in output
    assert len(audit) == 0


def test_mcp_failure_is_reported():
    _, audit, tools = setup_agent()

    async def failed_call(client, name, arguments):
        raise RuntimeError("GitHub MCP unavailable")

    with patch(
        "app.agents.multi_tool_agent.call_github_tool",
        side_effect=failed_call,
    ):
        output = run_tool(
            tools["get_pull_request"],
            {"pull_number": 1},
        )

    assert "GitHub MCP unavailable" in output
    assert len(audit) == 1


def test_tool_call_budget_sequential():
    _, audit, tools = setup_agent()

    calls = []

    async def fake_call(client, name, arguments):
        calls.append(name)
        return {"status": "ok"}

    with patch(
        "app.agents.multi_tool_agent.call_github_tool",
        side_effect=fake_call,
    ):
        for _ in range(12):
            run_tool(
                tools["get_pull_request"],
                {"pull_number": 1},
            )

    assert len(audit) <= 8
    assert len(calls) <= 8
