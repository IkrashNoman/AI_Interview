import re
import io
from typing import Union, BinaryIO
from faster_whisper import WhisperModel
import logging

logger = logging.getLogger(__name__)

# GPU Hardware Handoff optimization
try:
    # Uses CUDA and int8_float16 compression to maximize processing speeds within 4GB VRAM boundaries
    model = WhisperModel("base.en", device="cpu", compute_type="int8_float16")
except Exception as e:
    logger.warning("CUDA execution fallback tracking triggered. Defaulting processing to host CPU.")
    model = WhisperModel("base.en", device="cpu", compute_type="int8")

FILLER_WORDS_SET = {
    "um", "uh", "er", "erm", "ah", "eh", "hmm", "mm", "mmm",
    "like", "you know", "i mean", "well", "so", "okay", "ok", "right", "see", "look", "listen",
    "actually", "basically", "literally", "seriously", "honestly", "frankly", "obviously", 
    "clearly", "apparently", "simply",
    "kind of", "sort of", "type of", "more or less", "or something", "or whatever", 
    "and stuff", "and everything", "and all that", "and things", "and so on",
    "i guess", "i suppose", "i think", "i mean to say", "if you will", "believe me",
    "let me think", "lets see", "how should i put it", "how do i say this", 
    "whats the word", "what was it", "you see",
    "anyway", "anyhow", "at the end of the day", "in a way", "as it were", 
    "to be honest", "to tell you the truth",
    "you know what i mean", "if that makes sense", "does that make sense", 
    "you know what", "well then", "right then",
    "okay then", "alright", "all right", "got it", "fair enough"
}

def process_audio_chunk(audio_input: Union[str, BinaryIO]) -> dict:
    try:
        segments, info = model.transcribe(audio_input, beam_size=5, word_timestamps=True)
        
        full_text = ""
        word_count = 0
        filler_count = 0
        
        for segment in segments:
            full_text += segment.text + " "
            for word in segment.words:
                word_count += 1
                clean_word = re.sub(r'[^\w\s]', '', word.word.lower().strip())
                if clean_word in FILLER_WORDS_SET:
                    filler_count += 1

        duration_minutes = info.duration / 60.0
        wpm = int(word_count / duration_minutes) if duration_minutes > 0 else 0

        return {
            "transcript": full_text.strip(),
            "wpm": wpm,
            "filler_words": filler_count,
            "duration_seconds": info.duration
        }

    except Exception as e:
        logger.error(f"STT Processing failed: {str(e)}")
        return {"transcript": "", "wpm": 0, "filler_words": 0, "duration_seconds": 0}