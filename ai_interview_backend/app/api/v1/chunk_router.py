import os
import io
import json
import logging
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

# Thread-safe session initialization
from app.core.database import SessionLocal 
from app.models import InterviewSession, QuestionEvaluation
from app.services.stt_client import process_audio_chunk
from app.services.evaluator_client import evaluate_candidate_answer, classify_intent_and_simplify

logger = logging.getLogger(__name__)
router = APIRouter()

@router.websocket("/stream")
async def audio_stream_endpoint(websocket: WebSocket):
    """
    Production-Grade Real-Time WebSocket Endpoint.
    Ingests binary audio chunks directly into RAM buffers and processes 
    the data stream without hitting physical local storage disks.
    """
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
            logger.error("Invalid streaming protocol handshake sequence.")
            await websocket.close(code=1008)
            return
        
        session_id = handshake["session_id"]
        question_id = handshake["question_id"]

        # 2. In-Memory Ingestion Loop
        while True:
            message = await websocket.receive()
            
            if "bytes" in message:
                # Append chunks directly to system memory bytearray
                audio_buffer.extend(message["bytes"])
            
            elif "text" in message:
                data = json.loads(message["text"])
                if data.get("type") == "END_OF_TURN":
                    break

        if len(audio_buffer) == 0:
            await websocket.close(code=1003, reason="Empty audio buffer received.")
            return

        # 3. Memory-Stream Handoff (Zero Disk I/O)
        # Wraps the raw memory allocation buffer as an in-memory binary file stream object
        audio_memory_stream = io.BytesIO(audio_buffer)

        # Execute the STT processing by passing the memory stream object directly
        # Note: Ensure your app.services.stt_client.process_audio_chunk is modified 
        # to accept a file-like object (io.BytesIO) instead of a physical string path.
        audio_data = await asyncio.to_thread(process_audio_chunk, audio_memory_stream)
        transcript = audio_data.get('transcript', '')
        duration = audio_data.get('duration_seconds', 0)

        # 4. Context Extraction
        session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
        if not session:
            await websocket.send_json({"status": "error", "message": "Active session context missing."})
            return

        target_question = next((q for q in session.blueprint if q['id'] == question_id), None)
        if not target_question:
            await websocket.send_json({"status": "error", "message": "Question context target missing."})
            return

        # 5. Pipeline Interception: Asynchronous Intent Validation
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

        # 6. Parallel Evaluation and State Mapping
        # Offload cognitive evaluations to the CPU worker thread pool
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

        # 7. Asynchronous Completeness Check
        total_blueprint_questions = len(session.blueprint)
        completed_evaluations_count = db.query(QuestionEvaluation).filter(
            QuestionEvaluation.session_id == session_id
        ).count()

        if completed_evaluations_count >= total_blueprint_questions:
            session.status = "COMPLETED"
            logger.info(f"State Matrix Engine marked session {session_id} as COMPLETED.")
        
        db.commit()
        await websocket.send_json({"status": "success"})

    except WebSocketDisconnect:
        logger.info(f"WebSocket interface dropped naturally for session {session_id}")
    except Exception as e:
        db.rollback()
        logger.error(f"Execution engine failure on streaming socket: {str(e)}")
        try:
            await websocket.send_json({"status": "error", "message": "Internal processing failure"})
        except:
            pass
    finally:
        db.close()