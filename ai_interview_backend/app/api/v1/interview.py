from fastapi import APIRouter, HTTPException, status
import logging
from app.schemas.interview import InterviewInitializeRequest, InterviewBlueprintResponse
from app.services.interview_client import generate_interview_blueprint

# Configure logger
logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/initialize", response_model=InterviewBlueprintResponse, status_code=status.HTTP_201_CREATED)
async def initialize_interview(request: InterviewInitializeRequest):
    """
    Initializes a new interview session.
    Accepts the Job Description and Parsed Resume, returning a rigid 15-question blueprint.
    """
    try:
        # Pass the validated request data to the Gemini service
        blueprint = generate_interview_blueprint(
            job_description=request.job_description,
            parsed_resume=request.parsed_resume
        )
        
        # Log successful creation for debugging and monitoring
        logger.info(f"Blueprint generated successfully. Session ID: {blueprint.session_id}")
        
        return blueprint
        
    except Exception as e:
        logger.error(f"Error generating interview blueprint: {str(e)}")
        # If the LLM fails, hallucinates, or the API times out, fail explicitly.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate interview blueprint: {str(e)}"
        )