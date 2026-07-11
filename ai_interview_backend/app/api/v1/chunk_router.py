import os
import shutil
from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import InterviewSession, QuestionEvaluation
from app.services.stt_client import process_audio_chunk
from app.services.evaluator_client import evaluate_candidate_answer
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

# Ensure temp directory exists
os.makedirs("temp_audio", exist_ok=True)

def process_chunk_background(session_id: str, question_id: int, file_path: str, db: Session):
    """
    The asynchronous worker that runs while the user answers the next question.
    """
    try:
        # 1. Verify session exists
        session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
        if not session:
            return

        # 2. Extract specific question details from the JSON blueprint
        target_question = next((q for q in session.blueprint if q['id'] == question_id), None)
        if not target_question:
            return

        # 3. Run Local STT
        audio_data = process_audio_chunk(file_path)
        
        # 4. Run LLM Evaluation
        evaluation = evaluate_candidate_answer(
            question_text=target_question['question_text'],
            expected_keywords=target_question['expected_keywords'],
            transcript=audio_data['transcript']
        )

        # 5. Save Results to Database
        db_eval = QuestionEvaluation(
            session_id=session_id,
            question_id=question_id,
            transcript=audio_data['transcript'],
            audio_s3_url=file_path, # In Phase 6, this changes to a cloud URL
            structure_score=evaluation.structure_score,
            correctness_score=evaluation.correctness_score,
            completeness_score=evaluation.completeness_score
        )
        db.add(db_eval)
        db.commit()
        
        logger.info(f"Successfully processed Q{question_id} for session {session_id}")

    except Exception as e:
        logger.error(f"Background worker failed for Q{question_id}: {str(e)}")
    finally:
        # Optional: Delete the temp audio file here if you don't want to store them locally
        # os.remove(file_path)
        pass

@router.post("/process-chunk")
async def process_audio_upload(
    background_tasks: BackgroundTasks,
    session_id: str = Form(...),
    question_id: int = Form(...),
    audio_blob: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Receives the audio, saves it, and spawns the background evaluation task.
    """
    if not audio_blob.filename.endswith(('.webm', '.wav', '.mp3', '.ogg')):
        raise HTTPException(status_code=400, detail="Unsupported audio format")

    file_path = f"temp_audio/{session_id}_q{question_id}.webm"
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(audio_blob.file, buffer)

    # Dispatch to background worker
    background_tasks.add_task(process_chunk_background, session_id, question_id, file_path, db)

    return {"status": "processing", "message": "Chunk accepted and queued for evaluation."}