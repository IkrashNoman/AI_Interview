import pyttsx3

engine = pyttsx3.init()

text = """
This is your AI generated interview coach speaking.
Am I audible to you? Please check the box if you can hear me clearly.
If you cannot check it, your interview will not be started.
"""

engine.setProperty("rate", 200)

engine.save_to_file(text, "speaker-test1.wav")
engine.runAndWait()

print("Audio saved as speaker-test1.wav")