import os
import re
from faster_whisper import WhisperModel
import logging

logger = logging.getLogger(__name__)

# Load the model globally so it stays in RAM. 
# "base.en" is fast and lightweight for CPU. Use "small.en" if you have a GPU.
try:
    model = WhisperModel("base.en", device="cpu", compute_type="int8")
except Exception as e:
    logger.error("Failed to load Faster-Whisper. Is FFmpeg installed?")
    raise e

def process_audio_chunk(file_path: str) -> dict:
    """
    Transcribes audio locally and extracts deterministic metrics.
    """
    try:
        # word_timestamps=True forces the engine to track exact timing
        segments, info = model.transcribe(file_path, beam_size=5, word_timestamps=True)
        
        full_text = ""
        word_count = 0
        filler_count = 0
        filler_words_list = [
            "um",
            "uh",
            "er",
            "erm",
            "ah",
            "eh",
            "hmm",
            "mm",
            "mmm",

            "like",
            "you know",
            "i mean",
            "well",
            "so",
            "okay",
            "ok",
            "right",
            "see",
            "look",
            "listen",

            "actually",
            "basically",
            "literally",
            "seriously",
            "honestly",
            "frankly",
            "obviously",
            "clearly",
            "apparently",
            "simply",

            "kind of",
            "sort of",
            "type of",
            "more or less",
            "or something",
            "or whatever",
            "and stuff",
            "and everything",
            "and all that",
            "and things",
            "and so on",

            "I guess",
            "I suppose",
            "I think",
            "I mean to say",
            "if you will",
            "believe me",

            "let me think",
            "let's see",
            "how should I put it",
            "how do I say this",
            "what's the word",
            "what was it",
            "you see",

            "anyway",
            "anyhow",
            "at the end of the day",
            "in a way",
            "as it were",
            "to be honest",
            "to tell you the truth",

            "you know what I mean",
            "if that makes sense",
            "does that make sense",
            "you know what",
            "well then",
            "right then",

            "okay then",
            "alright",
            "all right",
            "got it",
            "fair enough"
        ]
        for segment in segments:
            full_text += segment.text + " "
            for word in segment.words:
                word_count += 1
                clean_word = re.sub(r'[^\w\s]', '', word.word.lower().strip())
                if clean_word in filler_words_list:
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