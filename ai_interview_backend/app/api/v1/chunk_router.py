import os
import io
import json
import logging
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.core.database import SessionLocal 
from app.models import InterviewSession, QuestionEvaluation
from app.services.stt_client import process_audio_chunk
from app.services.evaluator_client import evaluate_candidate_answer, classify_intent_and_simplify

logger = logging.getLogger(__name__)
router = APIRouter()

async def background_grade_and_save(session_id: str, question_id: int, transcript: str, audio_data: dict):
    """
    Fire-and-forget background task. 
    Grades the answer and saves to DB while the user is already answering the next question.
    """
    db: Session = SessionLocal()
    try:
        session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
        if not session:
            return

        target_question = next((q for q in session.blueprint if q['id'] == question_id), None)
        if not target_question:
            return

        # LLM Evaluation (Takes 1-3 seconds, but user doesn't feel it)
        evaluation = await asyncio.to_thread(
            evaluate_candidate_answer,
            target_question['question_text'],
            target_question['expected_keywords'],
            transcript
        )

        db_eval = QuestionEvaluation(
            session_id=session_id,
            question_id=question_id,
            transcript=transcript,
            audio_s3_url=f"memory://{session_id}_q{question_id}", 
            structure_score=evaluation.structure_score,
            correctness_score=evaluation.correctness_score,
            completeness_score=evaluation.completeness_score,
            wpm=audio_data.get('wpm', 0),
            filler_words_count=audio_data.get('filler_words', 0)
        )
        db.add(db_eval)
        db.flush()

        total_blueprint_questions = len(session.blueprint)
        completed_evaluations_count = db.query(QuestionEvaluation).filter(
            QuestionEvaluation.session_id == session_id
        ).count()

        if completed_evaluations_count >= total_blueprint_questions:
            session.status = "COMPLETED"
            logger.info(f"State Matrix Engine marked session {session_id} as COMPLETED.")
        
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Background grading failed for Q{question_id}: {str(e)}")
    finally:
        db.close()


@router.websocket("/stream")
async def audio_stream_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    db: Session = SessionLocal()
    session_id = None
    question_id = None
    audio_buffer = bytearray()

    try:
        # 1. Handshake Phase
        handshake_raw = await websocket.receive_text()
        handshake = json.loads(handshake_raw)
        
        if handshake.get("type") != "handshake":
            await websocket.close(code=1008)
            return
        
        session_id = handshake["session_id"]
        question_id = handshake["question_id"]

        # 2. In-Memory Ingestion Loop
        while True:
            message = await websocket.receive()
            if "bytes" in message:
                audio_buffer.extend(message["bytes"])
            elif "text" in message:
                data = json.loads(message["text"])
                if data.get("type") == "END_OF_TURN":
                    break

        if len(audio_buffer) == 0:
            await websocket.close(code=1003, reason="Empty audio buffer received.")
            return

        # 3. Blazing Fast STT (Memory Stream)
        audio_memory_stream = io.BytesIO(audio_buffer)
        audio_data = await asyncio.to_thread(process_audio_chunk, audio_memory_stream)
        transcript = audio_data.get('transcript', '')
        duration = audio_data.get('duration_seconds', 0)

        session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
        if not session:
            await websocket.send_json({"status": "error", "message": "Context missing."})
            return

        target_question = next((q for q in session.blueprint if q['id'] == question_id), None)

        # 4. Pipeline Interception: Asynchronous Intent Validation
        if duration < 12 and transcript:
            classification = await asyncio.to_thread(
                classify_intent_and_simplify, 
                transcript, 
                target_question['question_text']
            )
            if classification.intent == "clarification":
                await websocket.send_json({
                    "status": "clarification_required", 
                    "simplified_question": classification.simplified_question
                })
                return

        # 5. THE MAGIC TRICK: Instantly release the frontend
        await websocket.send_json({"status": "success"})

        # 6. Push the heavy LLM grading to an unawaited background task
        asyncio.create_task(
            background_grade_and_save(session_id, question_id, transcript, audio_data)
        )

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"Execution engine failure: {str(e)}")
        try:
            await websocket.send_json({"status": "error", "message": "Internal processing failure"})
        except:
            pass
    finally:
        db.close()