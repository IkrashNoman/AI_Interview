from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.orm import Session
import logging
from app.schemas.interview import InterviewInitializeRequest, InterviewBlueprintResponse
from app.services.interview_client import generate_interview_blueprint
from app.core.database import get_db
from app.models import InterviewSession, QuestionEvaluation

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/initialize", response_model=InterviewBlueprintResponse, status_code=status.HTTP_201_CREATED)
async def initialize_interview(request: InterviewInitializeRequest, db: Session = Depends(get_db)):
    try:
        blueprint = generate_interview_blueprint(
            job_description=request.job_description,
            parsed_resume=request.parsed_resume.model_dump() 
        )
        
        db_session = InterviewSession(
            id=blueprint.session_id,
            status="INITIALIZED",
            job_description=request.job_description,
            parsed_resume=request.parsed_resume.model_dump(),
            blueprint=[q.model_dump() for q in blueprint.blueprint]
        )
        db.add(db_session)
        db.commit()
        db.refresh(db_session)
        
        logger.info(f"Session {blueprint.session_id} saved to database.")
        return blueprint
        
    except Exception as e:
        logger.error(f"Error generating blueprint: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate interview blueprint: {str(e)}"
        )

@router.get("/{session_id}/results")
async def get_interview_results(session_id: str, db: Session = Depends(get_db)):
    """
    Optimized Read-Only Results Fetcher.
    Prevents database write-locks during rapid frontend polling cycles.
    """
    session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # If the background thread hasn't explicitly flagged completion, return pending state immediately
    if session.status != "COMPLETED":
        return {"status": "pending", "message": "Evaluations are still processing in the background queue."}

    evaluations = db.query(QuestionEvaluation).filter(QuestionEvaluation.session_id == session_id).all()
    if not evaluations:
        return {"status": "pending", "message": "Compiling data metrics..."}

    total_questions_answered = len(evaluations)
    
    # Execute lookups cleanly without modifying database rows
    avg_structure = sum((e.structure_score or 0) for e in evaluations) / total_questions_answered
    avg_correctness = sum((e.correctness_score or 0) for e in evaluations) / total_questions_answered
    avg_completeness = sum((e.completeness_score or 0) for e in evaluations) / total_questions_answered
    
    avg_wpm = sum((e.wpm or 0) for e in evaluations) / total_questions_answered
    total_fillers = sum((e.filler_words_count or 0) for e in evaluations)

    overall_interview_score = (avg_structure + avg_correctness + avg_completeness) / 3

    return {
        "session_id": session_id,
        "status": "COMPLETED",
        "metrics": {
            "questions_answered": total_questions_answered,
            "overall_interview_score": round(overall_interview_score, 2),
            "average_structure": round(avg_structure, 2),
            "average_correctness": round(avg_correctness, 2),
            "average_completeness": round(avg_completeness, 2),
            "communication": {
                "average_wpm": round(avg_wpm, 2),
                "total_filler_words": total_fillers
            }
        },
        "detailed_evaluations": [
            {
                "question_id": e.question_id,
                "structure_score": e.structure_score,
                "correctness_score": e.correctness_score,
                "completeness_score": e.completeness_score,
                "filler_words": e.filler_words_count,
                "wpm": e.wpm
            } for e in evaluations
        ]
    }