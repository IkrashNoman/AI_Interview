from fastapi import APIRouter, HTTPException, status, Depends
import logging
from app.schemas.interview import InterviewInitializeRequest, InterviewBlueprintResponse
from app.services.interview_client import generate_interview_blueprint
from app.core.database import get_db
from app.models import InterviewSession
from sqlalchemy.orm import Session

# Configure logger
logger = logging.getLogger(__name__)

router = APIRouter()
    
@router.post("/initialize", response_model=InterviewBlueprintResponse, status_code=status.HTTP_201_CREATED)
async def initialize_interview(request: InterviewInitializeRequest, db: Session = Depends(get_db)):
    """
    Initializes a new interview session and saves it to the SQLite database.
    """
    try:
        # 1. Generate the blueprint via Gemini
        blueprint = generate_interview_blueprint(
            job_description=request.job_description,
            parsed_resume=request.parsed_resume.model_dump() # Convert Pydantic to dict for JSON serialization
        )
        
        # 2. Save the session state to the database
        db_session = InterviewSession(
            id=blueprint.session_id,
            status="INITIALIZED",
            job_description=request.job_description,
            parsed_resume=request.parsed_resume.model_dump(),
            blueprint=[q.model_dump() for q in blueprint.blueprint] # Store questions as JSON array
        )
        db.add(db_session)
        db.commit()
        db.refresh(db_session)
        
        logger.info(f"Session {blueprint.session_id} saved to database.")
        return blueprint
        
    except Exception as e:
        logger.error(f"Error generating blueprint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))