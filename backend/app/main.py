import json
import os
from pathlib import Path
import logging
from fastapi import HTTPException
from fastapi import Depends
from app.security import require_api_key

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from app.observability import ObservabilityMiddleware
from app.database import (
    Base,
    engine,
    SessionLocal,
    AnalysisReport,
)
from app.services.repository_context import (
    collect_repository_context,
)
from app.agents.multi_tool_agent import build_multi_tool_agent
from app.agents.review_agent import review_graph
from app.agents.ci_agent import ci_graph
from app.services.github_service import (
    github_mcp,
    call_github_tool,
)

# --------------------------------------------------
# Logging
# --------------------------------------------------

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("devpilot-ai")


# --------------------------------------------------
# Database initialization
# --------------------------------------------------

Base.metadata.create_all(bind=engine)


# --------------------------------------------------
# FastAPI Application
# --------------------------------------------------

app = FastAPI(
    title="DevPilot AI",
    description=(
        "MCP-powered Developer Productivity Agent "
        "for GitHub Pull Request Reviews, "
        "CI/CD Failure Analysis, and Report History."
    ),
    version="0.3.0",
)

app.add_middleware(ObservabilityMiddleware)
# --------------------------------------------------
# Request Models
# --------------------------------------------------

class PRReviewRequest(BaseModel):
    owner: str = Field(
        min_length=1,
        max_length=39,
        pattern=r"^[A-Za-z0-9-]+$",
    )
    repo: str = Field(
        min_length=1,
        max_length=100,
        pattern=r"^[A-Za-z0-9_.-]+$",
    )
    pull_number: int = Field(gt=0)


class CIAnalysisRequest(BaseModel):
    owner: str = Field(
        min_length=1,
        max_length=39,
        pattern=r"^[A-Za-z0-9-]+$",
    )
    repo: str = Field(
        min_length=1,
        max_length=100,
        pattern=r"^[A-Za-z0-9_.-]+$",
    )
    run_id: int = Field(gt=0)

class InvestigationRequest(BaseModel):
    owner: str = Field(pattern=r"^[A-Za-z0-9-]+$")
    repo: str = Field(pattern=r"^[A-Za-z0-9_.-]+$")
    question: str = Field(
        min_length=10,
        max_length=1000
    )



# --------------------------------------------------
# Repository Validation
# --------------------------------------------------

def validate_repository(owner: str, repo: str):
    allowed_owner = os.getenv("GITHUB_OWNER")
    allowed_repo = os.getenv("GITHUB_REPO")

    if not allowed_owner or not allowed_repo:
        raise HTTPException(
            status_code=503,
            detail="GitHub repository is not configured.",
        )

    if owner != allowed_owner or repo != allowed_repo:
        raise HTTPException(
            status_code=403,
            detail="Repository not permitted.",
        )


# --------------------------------------------------
# Database Helpers
# --------------------------------------------------

def save_report(
    report_type: str,
    repository: str,
    reference_id: int,
    result: dict,
) -> int:
    """Save an AI-generated report to SQLite."""

    with SessionLocal() as db:
        report = AnalysisReport(
            report_type=report_type,
            repository=repository,
            reference_id=reference_id,
            result=result,
        )

        db.add(report)
        db.commit()
        db.refresh(report)

        logger.info(
            "Saved %s report with ID %s",
            report_type,
            report.id,
        )

        return report.id


def serialize_report(report):
    """Convert a database report into JSON-compatible data."""

    return {
        "id": report.id,
        "type": report.report_type,
        "repository": report.repository,
        "reference_id": report.reference_id,
        "result": report.result,
        "created_at": (
            report.created_at.isoformat()
            if report.created_at
            else None
        ),
    }


# --------------------------------------------------
# Health Endpoints
# --------------------------------------------------

@app.get("/")
async def root():
    return {
        "message": "Welcome to DevPilot AI",
        "version": "0.3.0",
        "features": [
            "AI Pull Request Review",
            "CI Failure Investigation",
            "Repository-Aware Analysis",
            "Analysis History",
        ],
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "DevPilot AI",
    }


# --------------------------------------------------
# Feature 1: AI Pull Request Reviewer
# --------------------------------------------------

@app.post("/api/review-pr")
async def review_pr(request: PRReviewRequest):
    validate_repository(request.owner, request.repo)

    repository = f"{request.owner}/{request.repo}"

    try:
        logger.info(
            "Starting PR review: %s #%s",
            repository,
            request.pull_number,
        )

        async with github_mcp() as client:

            arguments = {
                "owner": request.owner,
                "repo": request.repo,
                "pullNumber": request.pull_number,
            }

            # Retrieve pull request metadata
            pr = await call_github_tool(
                client,
                "pull_request_read",
                {
                    **arguments,
                    "method": "get",
                },
            )

            # Retrieve changed files
            files = await call_github_tool(
                client,
                "pull_request_read",
                {
                    **arguments,
                    "method": "get_files",
                },
            )

        # Run LangGraph review agent
        result = await review_graph.ainvoke(
            {
                "pr_title": pr["title"],
                "files": files,
                "review": {},
            }
        )

        review_data = result["review"]

        # Store completed report
        report_id = save_report(
            report_type="pr_review",
            repository=repository,
            reference_id=request.pull_number,
            result=review_data,
        )

        logger.info(
            "PR review completed: %s #%s",
            repository,
            request.pull_number,
        )

        return {
            "status": "success",
            "report_id": report_id,
            "repository": repository,
            "pull_number": request.pull_number,
            "review": review_data,
        }

    except HTTPException:
        raise

    except Exception:
        logger.exception("PR review failed")

        raise HTTPException(
            status_code=502,
            detail=(
                "Pull request review failed. "
                "Check FastAPI server logs."
            ),
        )


# --------------------------------------------------
# Feature 2: Repository-Aware CI Analysis
# --------------------------------------------------

@app.post("/api/analyze-ci")
async def analyze_ci(request: CIAnalysisRequest):
    validate_repository(request.owner, request.repo)

    repository = f"{request.owner}/{request.repo}"

    try:
        logger.info(
            "Starting CI investigation: %s run %s",
            repository,
            request.run_id,
        )

        async with github_mcp() as client:

            # Fetch recent workflow runs
            runs_data = await call_github_tool(
                client,
                "actions_list",
                {
                    "method": "list_workflow_runs",
                    "owner": request.owner,
                    "repo": request.repo,
                    "perPage": 100,
                },
            )

            runs = runs_data.get("workflow_runs", [])

            # Find the requested workflow run
            selected_run = next(
                (
                    run
                    for run in runs
                    if run.get("id") == request.run_id
                ),
                None,
            )

            if selected_run is None:
                raise HTTPException(
                    status_code=404,
                    detail=(
                        "Workflow run not found in "
                        "recent workflow history."
                    ),
                )

            # Ensure the run has completed with failure
            if selected_run.get("conclusion") != "failure":
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Selected workflow run is not "
                        "a completed failed run."
                    ),
                )

            commit_sha = selected_run["head_sha"]

            logger.info(
                "Investigating failed commit: %s",
                commit_sha,
            )

            # Retrieve failed job logs
            logs = await call_github_tool(
                client,
                "get_job_logs",
                {
                    "owner": request.owner,
                    "repo": request.repo,
                    "run_id": request.run_id,
                    "failed_only": True,
                    "return_content": True,
                    "tail_lines": 200,
                },
            )

            # Retrieve repository files at failed commit
            repository_context = (
                await collect_repository_context(
                    client,
                    request.owner,
                    request.repo,
                    commit_sha,
                )
            )

        # Convert evidence to text for the agent
        logs_text = json.dumps(
            logs,
            ensure_ascii=False,
            default=str,
        )

        context_text = json.dumps(
            repository_context,
            ensure_ascii=False,
            default=str,
        )

        # Run LangGraph CI investigation agent
        result = await ci_graph.ainvoke(
            {
                "run_id": request.run_id,
                "logs": logs_text,
                "repository_context": context_text,
                "report": {},
            }
        )

        analysis_data = result["report"]

        # Save analysis history
        report_id = save_report(
            report_type="ci_analysis",
            repository=repository,
            reference_id=request.run_id,
            result=analysis_data,
        )

        logger.info(
            "CI investigation completed: run %s",
            request.run_id,
        )

        return {
            "status": "success",
            "report_id": report_id,
            "repository": repository,
            "run_id": request.run_id,
            "analyzed_commit": commit_sha,
            "analysis": analysis_data,
        }

    except HTTPException:
        raise

    except Exception:
        logger.exception("CI investigation failed")

        raise HTTPException(
            status_code=502,
            detail=(
                "CI investigation failed. "
                "Check FastAPI server logs."
            ),
        )


# --------------------------------------------------
# Feature 3: Analysis History
# --------------------------------------------------

@app.get("/api/reports")
async def get_reports(
    limit: int = Query(default=50, ge=1, le=100),
):
    """Retrieve the latest saved analysis reports."""

    try:
        with SessionLocal() as db:
            reports = db.execute(
                select(AnalysisReport)
                .order_by(AnalysisReport.id.desc())
                .limit(limit)
            ).scalars().all()

            return [
                serialize_report(report)
                for report in reports
            ]

    except Exception:
        logger.exception("Failed to retrieve reports")

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve analysis history.",
        )


@app.get("/api/reports/{report_id}")
async def get_report_by_id(report_id: int):
    """Retrieve one saved report by its database ID."""

    try:
        with SessionLocal() as db:
            report = db.get(
                AnalysisReport,
                report_id,
            )

            if report is None:
                raise HTTPException(
                    status_code=404,
                    detail="Report not found.",
                )

            return serialize_report(report)

    except HTTPException:
        raise

    except Exception:
        logger.exception("Failed to retrieve report")

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve report.",
        )

@app.post(
    "/api/investigate",
    dependencies=[Depends(require_api_key)],
)
async def investigate(request: InvestigationRequest):
    validate_repository(request.owner, request.repo)

    repository = f"{request.owner}/{request.repo}"

    try:
        async with github_mcp() as client:
            agent, audit = build_multi_tool_agent(
                client,
                request.owner,
                request.repo,
            )

            result = await agent.ainvoke(
                {
                    "messages": [
                        {
                            "role": "user",
                            "content": request.question,
                        }
                    ]
                },
                config={"recursion_limit": 30},
            )

        final_message = result["messages"][-1]
        answer = final_message.content

        if not isinstance(answer, str):
            answer = json.dumps(answer, default=str)

        report_data = {
            "question": request.question,
            "answer": answer,
            "tool_calls": audit,
        }

        report_id = save_report(
            report_type="multi_tool",
            repository=repository,
            reference_id=0,
            result=report_data,
        )

        return {
            "status": "success",
            "report_id": report_id,
            "repository": repository,
            "answer": answer,
            "tool_calls": audit,
            "tool_call_count": len(audit),
        }

    except Exception:
        logger.exception("Multi-tool investigation failed")
        raise HTTPException(
            status_code=502,
            detail="Multi-tool investigation failed. Check server logs.",
        )
    
@app.get("/api/evaluations/latest")
async def get_latest_evaluation():
    report_path = Path(
        os.getenv(
            "EVALUATION_REPORT_PATH",
            "evaluations/live_evaluation_report.json",
        )
    )

    if not report_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="No evaluation report found. Run the benchmark first.",
        )

    try:
        with report_path.open(encoding="utf-8") as file:
            report = json.load(file)
    except (OSError, ValueError):
        raise HTTPException(
            status_code=500,
            detail="Unable to load the evaluation report.",
        )

    if not isinstance(report, dict):
        raise HTTPException(
            status_code=500,
            detail="Invalid evaluation report format.",
        )

    # Only expose aggregate metrics to the dashboard.
    # Full traces can contain repository data or logs.
    allowed_fields = (
        "timestamp",
        "total",
        "successful",
        "success_rate",
        "average_latency_seconds",
        "average_mcp_calls",
        "within_tool_budget",
        "diagnostic_accuracy",
    )

    return {
        field: report.get(field)
        for field in allowed_fields
    }

# -------------------------------------------------------
# Feature 5: Agent Evaluation Dashboard
# -------------------------------------------------------

@app.get("/api/evaluations/latest")
async def get_latest_evaluation():
    report_path = Path(
        os.getenv(
            "EVALUATION_REPORT_PATH",
            "/app/evaluations/live_evaluation_report.json",
        )
    )

    if not report_path.is_file():
        raise HTTPException(
            status_code=404,
            detail=(
                "Evaluation report not found. "
                "Check the Docker volume and report path."
            ),
        )

    try:
        with report_path.open(
            "r", encoding="utf-8"
        ) as file:
            report = json.load(file)

    except (OSError, ValueError):
        raise HTTPException(
            status_code=500,
            detail="Unable to read evaluation report.",
        )

    if not isinstance(report, dict):
        raise HTTPException(
            status_code=500,
            detail="Invalid evaluation report format.",
        )

    allowed_fields = [
        "timestamp",
        "total",
        "successful",
        "success_rate",
        "average_latency_seconds",
        "average_mcp_calls",
        "within_tool_budget",
        "diagnostic_accuracy",
    ]

    return {
        key: report.get(key)
        for key in allowed_fields
    }

