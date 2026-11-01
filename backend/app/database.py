
import os
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    DateTime,
    JSON,
)
from sqlalchemy.orm import (
    declarative_base,
    sessionmaker,
)


# ------------------------------------------
# Database Configuration
# ------------------------------------------

# Local database location:
# devpilot-ai/devpilot.db
BASE_DIR = Path(__file__).resolve().parents[2]

DEFAULT_DB_PATH = BASE_DIR / "devpilot.db"

# Use DATABASE_URL in Docker.
# Example: sqlite:////app/data/devpilot.db
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{DEFAULT_DB_PATH}",
)


# ------------------------------------------
# SQLAlchemy Engine
# ------------------------------------------

connect_args = (
    {"check_same_thread": False}
    if DATABASE_URL.startswith("sqlite:")
    else {}
)

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)


# ------------------------------------------
# Database Session
# ------------------------------------------

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


# ------------------------------------------
# Base Model
# ------------------------------------------

Base = declarative_base()


# ------------------------------------------
# Analysis Reports Table
# ------------------------------------------

class AnalysisReport(Base):
    __tablename__ = "analysis_reports"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    report_type = Column(
        String(50),
        nullable=False,
        index=True,
    )

    repository = Column(
        String(255),
        nullable=False,
        index=True,
    )

    reference_id = Column(
        Integer,
        nullable=False,
    )

    result = Column(
        JSON,
        nullable=False,
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


# ------------------------------------------
# Initialize Database Tables
# ------------------------------------------

def init_db():
    """Create tables if they do not already exist."""
    Base.metadata.create_all(bind=engine)


# Preserve compatibility with your existing
# FastAPI application initialization.
init_db()
