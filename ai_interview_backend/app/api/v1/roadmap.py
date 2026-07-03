from fastapi import APIRouter, HTTPException
from app.schemas.roadmap import RoadmapRequest, ProjectRoadmapResponse
from app.services.project_client import generate_project_roadmap

router = APIRouter()

@router.post("/roadmap/", response_model=ProjectRoadmapResponse)
async def create_technical_roadmap(request: RoadmapRequest):
    try:
        roadmap = generate_project_roadmap(
            missing_skills=request.missing_skills,
            experience_gap=request.experience_gap,
            jd_text=request.job_description_text
        )
        return roadmap
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="An unexpected error occurred during roadmap generation.")