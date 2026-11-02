
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
SCENARIOS_FILE = BASE_DIR / "scenarios.json"
REPORT_FILE = BASE_DIR / "evaluation_report.json"

REQUIRED_FIELDS = {
    "id",
    "category",
    "question",
    "evidence",
    "expected_root_cause",
    "expected_keywords",
}


def main():
    with open(SCENARIOS_FILE, encoding="utf-8") as f:
        scenarios = json.load(f)

    if not isinstance(scenarios, list):
        raise ValueError("Scenarios must be a JSON array")

    ids = [scenario["id"] for scenario in scenarios]

    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate scenario IDs found")

    for scenario in scenarios:
        missing = REQUIRED_FIELDS - scenario.keys()
        if missing:
            raise ValueError(
                f"{scenario['id']}: missing fields {missing}"
            )

    report = {
        "timestamp": datetime.now(
            timezone.utc
        ).isoformat(),
        "total_scenarios": len(scenarios),
        "categories": dict(
            Counter(s["category"] for s in scenarios)
        ),
        "validation": "passed",
        "agent_executions": 0,
        "accuracy": None,
        "note": (
            "Dataset validation only. "
            "No LLM or MCP evaluation executed yet."
        ),
    }

    REPORT_FILE.write_text(
        json.dumps(report, indent=2),
        encoding="utf-8",
    )

    print("Evaluation dataset validated!")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
