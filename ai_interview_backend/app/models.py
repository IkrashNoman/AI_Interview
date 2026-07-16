from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id = Column(String, primary_key=True, index=True)
    status = Column(String, default="INITIALIZED")
    job_description = Column(Text, nullable=False)
    parsed_resume = Column(JSON, nullable=False)
    blueprint = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    evaluations = relationship(
        "QuestionEvaluation",
        back_populates="session",
        cascade="all, delete-orphan"
    )


class QuestionEvaluation(Base):
    __tablename__ = "question_evaluations"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(
        String,
        ForeignKey("interview_sessions.id"),
        nullable=False
    )
    question_id = Column(Integer, nullable=False)

    transcript = Column(Text, nullable=True)
    audio_s3_url = Column(String, nullable=True)

    structure_score = Column(Integer, nullable=True)
    correctness_score = Column(Integer, nullable=True)
    completeness_score = Column(Integer, nullable=True)

    wpm = Column(Integer, nullable=True, default=0)
    filler_words_count = Column(Integer, nullable=True, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship(
        "InterviewSession",
        back_populates="evaluations"
    )