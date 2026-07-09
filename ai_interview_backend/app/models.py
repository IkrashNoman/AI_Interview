from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id = Column(String, primary_key=True, index=True, description="UUID session identifier")
    status = Column(String, default="INITIALIZED", description="INITIALIZED, IN_PROGRESS, COMPLETED")
    job_description = Column(Text, nullable=False)
    parsed_resume = Column(JSON, nullable=False)
    blueprint = Column(JSON, nullable=False, description="The full 15-question JSON array")
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationship to link evaluations
    evaluations = relationship("QuestionEvaluation", back_populates="session", cascade="all, delete-orphan")


class QuestionEvaluation(Base):
    __tablename__ = "question_evaluations"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("interview_sessions.id"), nullable=False)
    question_id = Column(Integer, nullable=False, description="Corresponds to the 1-15 ID from the blueprint")
    
    transcript = Column(Text, nullable=True, description="The raw text extracted by the STT engine")
    audio_s3_url = Column(String, nullable=True, description="Local or cloud path to the WebM chunk")
    
    # Granular AI Scoring
    structure_score = Column(Integer, nullable=True)
    correctness_score = Column(Integer, nullable=True)
    completeness_score = Column(Integer, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)

    # Back reference to the session
    session = relationship("InterviewSession", back_populates="evaluations")