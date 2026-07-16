import os
import shutil
import logging
from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

# Explicitly import SessionLocal to allow thread-safe session initialization
from app.core.database import get_db, SessionLocal 
from app.models import InterviewSession, QuestionEvaluation
from app.services.stt_client import process_audio_chunk
from app.services.evaluator_client import evaluate_candidate_answer, classify_intent_and_simplify

logger = logging.getLogger(__name__)
router = APIRouter()

os.makedirs("temp_audio", exist_ok=True)

def process_chunk_background(session_id: str, question_id: int, file_path: str):
    """
    Asynchronous worker that spawns its own thread-isolated database context,
    evaluates answers, and updates the global session status upon completion.
    """
    # Spawn an independent DB session specifically for this background thread
    db: Session = SessionLocal()
    try:
        session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
        if not session:
            logger.error(f"Session {session_id} not found by background worker.")
            return

        target_question = next((q for q in session.blueprint if q['id'] == question_id), None)
        if not target_question:
            logger.error(f"Question ID {question_id} missing from blueprint for session {session_id}")
            return

        # 1. Local STT Extraction
        audio_data = process_audio_chunk(file_path)
        
        # 2. LLM Strict Evaluation
        evaluation = evaluate_candidate_answer(
            question_text=target_question['question_text'],
            expected_keywords=target_question['expected_keywords'],
            transcript=audio_data['transcript']
        )

        # 3. Database Persistence
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
        db.flush() # Flush to make the record visible within the transaction context

        # 4. State Completeness Engine
        # Verify if all questions belonging to this blueprint have been answered
        total_blueprint_questions = len(session.blueprint)
        completed_evaluations_count = db.query(QuestionEvaluation).filter(
            QuestionEvaluation.session_id == session_id
        ).count()

        if completed_evaluations_count >= total_blueprint_questions:
            # All evaluations are accounted for; transition state out of pending
            session.status = "completed"
            logger.info(f"Session {session_id} marked as COMPLETED by state engine.")
        
        db.commit()
        logger.info(f"Successfully processed Q{question_id} for session {session_id}")

    except Exception as e:
        db.rollback()
        logger.error(f"Background worker failed for Q{question_id}: {str(e)}")
    finally:
        db.close() # Force absolute cleanup of the thread connection pool

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

    audio_data = process_audio_chunk(file_path)
    
    # INTERCEPTOR: Clarification Intent Verification
    if audio_data.get('duration_seconds', 0) < 12 and audio_data.get('transcript'):
        classification = classify_intent_and_simplify(audio_data['transcript'], target_question['question_text'])
        
        if classification.intent == "clarification":
            try:
                os.remove(file_path)
            except OSError:
                pass
            return {
                "status": "clarification_required", 
                "simplified_question": classification.simplified_question
            }

    # Safe Handoff: The db dependency is omitted here; the worker manages its own lifecycle.
    background_tasks.add_task(process_chunk_background, session_id, question_id, file_path)

    return {"status": "processing", "message": "Chunk accepted and queued for evaluation."}