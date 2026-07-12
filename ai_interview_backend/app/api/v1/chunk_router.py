import os
import shutil
from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import InterviewSession, QuestionEvaluation
from app.services.stt_client import process_audio_chunk
from app.services.evaluator_client import evaluate_candidate_answer, classify_intent_and_simplify
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

# Ensure temp directory exists for incoming audio chunks
os.makedirs("temp_audio", exist_ok=True)

def process_chunk_background(session_id: str, question_id: int, file_path: str, db: Session):
    """
    Asynchronous worker that grades an answer without blocking the Next.js UI.
    """
    try:
        session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
        if not session:
            return

        target_question = next((q for q in session.blueprint if q['id'] == question_id), None)
        if not target_question:
            return

        # 1. Local STT Extraction
        audio_data = process_audio_chunk(file_path)
        
        # 2. LLM Strict Evaluation
        evaluation = evaluate_candidate_answer(
            question_text=target_question['question_text'],
            expected_keywords=target_question['expected_keywords'],
            transcript=audio_data['transcript']
        )

        # 3. Database Persistence (Includes WPM and Filler Counts)
        db_eval = QuestionEvaluation(
            session_id=session_id,
            question_id=question_id,
            transcript=audio_data['transcript'],
            audio_s3_url=file_path, 
            structure_score=evaluation.structure_score,
            correctness_score=evaluation.correctness_score,
            completeness_score=evaluation.completeness_score,
            wpm=audio_data.get('wpm', 0),
            filler_words_count=audio_data.get('filler_words', 0)
        )
        db.add(db_eval)
        db.commit()
        
        logger.info(f"Successfully processed Q{question_id} for session {session_id}")

    except Exception as e:
        logger.error(f"Background worker failed for Q{question_id}: {str(e)}")
    finally:
        # We leave the file intact for now so you can review recordings during dev.
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
    Receives frontend audio blob, checks for clarification intent, or queues for grading.
    """
    if not audio_blob.filename.endswith(('.webm', '.wav', '.mp3', '.ogg')):
        raise HTTPException(status_code=400, detail="Unsupported audio format")

    session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    target_question = next((q for q in session.blueprint if q['id'] == question_id), None)
    if not target_question:
        raise HTTPException(status_code=404, detail="Question ID not found in blueprint")

    file_path = f"temp_audio/{session_id}_q{question_id}.webm"
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(audio_blob.file, buffer)

    # Fast synchronous STT to check length
    audio_data = process_audio_chunk(file_path)
    
    # INTERCEPTOR: If audio is under 12 seconds, check if it's a request for clarification
    if audio_data.get('duration_seconds', 0) < 12 and audio_data.get('transcript'):
        classification = classify_intent_and_simplify(audio_data['transcript'], target_question['question_text'])
        
        if classification.intent == "clarification":
            # Delete useless audio and tell UI to repeat the simplified question
            os.remove(file_path)
            return {
                "status": "clarification_required", 
                "simplified_question": classification.simplified_question
            }

    # Not a clarification request, send to background worker
    background_tasks.add_task(process_chunk_background, session_id, question_id, file_path, db)

    return {"status": "processing", "message": "Chunk accepted and queued for evaluation."}