import pyttsx3

engine = pyttsx3.init()

text = """
This is your AI generated interview coach speaking.
Are you ready to start the interview?
"""

engine.setProperty("rate", 200)

engine.save_to_file(text, "speaker-test1.wav")
engine.runAndWait()

print("Audio saved as speaker-test1.wav")