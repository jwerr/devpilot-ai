
import argparse
import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent


def evaluate(base_url, scenarios, timeout):
    results = []

    for scenario in scenarios:
        scenario_id = scenario["id"]
        print(f"\nRunning {scenario_id}...")

        payload = {
            "owner": scenario["owner"],
            "repo": scenario["repo"],
            "question": scenario["question"],
        }

        request = urllib.request.Request(
            base_url.rstrip("/") + "/api/investigate",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        start = time.perf_counter()
        response_data = {}
        status_code = None
        error = None

        try:
            with urllib.request.urlopen(
                request,
                timeout=timeout,
            ) as response:
                status_code = response.status
                response_data = json.loads(
                    response.read().decode("utf-8")
                )

        except urllib.error.HTTPError as exc:
            status_code = exc.code
            error = exc.read().decode(
                "utf-8", errors="replace"
            )[:1000]

        except (
            urllib.error.URLError,
            TimeoutError,
            ValueError,
        ) as exc:
            error = str(exc)

        latency = round(
            time.perf_counter() - start, 2
        )

        answer = response_data.get("answer", "")
        if not isinstance(answer, str):
            answer = json.dumps(answer, default=str)

        tool_calls = response_data.get("tool_calls", [])
        if not isinstance(tool_calls, list):
            tool_calls = []

        raw_count = response_data.get(
            "tool_call_count", len(tool_calls)
        )
        call_count = (
            raw_count
            if isinstance(raw_count, int)
            else len(tool_calls)
        )

        success = (
            status_code == 200
            and response_data.get("status") == "success"
            and bool(answer.strip())
        )

        result = {
            "id": scenario_id,
            "category": scenario["category"],
            "success": success,
            "http_status": status_code,
            "latency_seconds": latency,
            "tool_call_count": call_count,
            "within_eight_call_budget": call_count <= 8,
            "tool_names": [
                call.get("tool", "unknown")
                for call in tool_calls
                if isinstance(call, dict)
            ],
            "answer": answer,
            "tool_calls": tool_calls,
            "error": error,
        }

        results.append(result)

        print(
            f"Success: {success} | "
            f"Latency: {latency}s | "
            f"MCP calls: {call_count}"
        )

    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--url",
        default="http://localhost:8000",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=180,
    )
    args = parser.parse_args()

    scenarios = json.loads(
        (BASE / "live_scenarios.json").read_text(
            encoding="utf-8"
        )
    )

    if not isinstance(scenarios, list) or not scenarios:
        raise ValueError("Expected nonempty scenario list")

    results = evaluate(
        args.url,
        scenarios,
        args.timeout,
    )

    completed = [r for r in results if r["success"]]

    report = {
        "timestamp": datetime.now(
            timezone.utc
        ).isoformat(),
        "total": len(results),
        "successful": len(completed),
        "success_rate": round(
            len(completed) / len(results) * 100, 2
        ),
        "average_latency_seconds": round(
            sum(r["latency_seconds"] for r in results)
            / len(results),
            2,
        ),
        "average_mcp_calls": round(
            sum(r["tool_call_count"] for r in results)
            / len(results),
            2,
        ),
        "within_tool_budget": sum(
            r["within_eight_call_budget"]
            for r in results
        ),
        "diagnostic_accuracy": None,
        "note": (
            "Live operational benchmark only. "
            "Successful responses are not proof of "
            "diagnostic correctness. Manual or labeled "
            "evaluation is required."
        ),
        "results": results,
    }

    destination = BASE / "live_evaluation_report.json"
    destination.write_text(
        json.dumps(report, indent=2),
        encoding="utf-8",
    )

    print("\n=== DevPilot AI Evaluation ===")
    print(f"Scenarios: {report['total']}")
    print(f"Successful: {report['successful']}")
    print(f"Success rate: {report['success_rate']}%")
    print(
        "Average latency: "
        f"{report['average_latency_seconds']}s"
    )
    print(
        "Average MCP calls: "
        f"{report['average_mcp_calls']}"
    )
    print(f"Report: {destination}")


if __name__ == "__main__":
    main()
