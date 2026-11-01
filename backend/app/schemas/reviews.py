
from typing import Literal
from pydantic import BaseModel


class ReviewFinding(BaseModel):
    severity: Literal["critical", "high", "medium", "low"]
    filename: str
    line: int
    issue: str
    explanation: str
    suggested_fix: str


class ReviewReport(BaseModel):
    summary: str
    findings: list[ReviewFinding]
    overall_risk: Literal["high", "medium", "low", "none"]
