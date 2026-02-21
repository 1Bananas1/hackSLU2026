"""
Voice Confirmation Handler for Pothole Detection
HackSLU 2026 - Vigilane

When the ML pipeline detects a pothole, this module:
  1. Asks the driver "Was that a pothole?" via text-to-speech
  2. Listens for a spoken yes/no response (5-second window)
  3. If ambiguous/timeout, reprompts once
  4. Falls back to a configurable default (discard or keep)

Dependencies:
    pip install pyttsx3 SpeechRecognition pyaudio
"""

import threading
import time

try:
    import pyttsx3
    _TTS_AVAILABLE = True
except ImportError:
    _TTS_AVAILABLE = False

try:
    import speech_recognition as sr
    _STR_AVAILABLE = True
except ImportError:
    _STR_AVAILABLE = False


# ---------------------------------------------------------------------------
# Response keyword sets
# ---------------------------------------------------------------------------
AFFIRMATIVES = {
    "yes", "yeah", "yep", "yup", "correct", "right",
    "affirmative", "confirm", "sure", "absolutely",
    "definitely", "of course", "indeed", "positive",
    "true", "aye", "ok", "okay",
}

NEGATIVES = {
    "no", "nope", "nah", "negative", "wrong", "incorrect",
    "discard", "ignore", "false", "nay", "never",
    "not", "none",
}


# ---------------------------------------------------------------------------
# VoiceConfirmationHandler
# ---------------------------------------------------------------------------
class VoiceConfirmationHandler:
    """
    Handles the full voice confirmation loop for a detected pothole event.

    Args:
        fallback (str): Action when response is absent or ambiguous after
                        reprompt.  "discard" (default) or "keep".
        listen_timeout (float): Seconds to wait for speech to begin.
        phrase_limit (float): Max seconds to record after speech begins.
        tts_rate (int): TTS speech rate (words-per-minute). Default: 175.
    """

    def __init__(
        self,
        fallback: str = "discard",
        listen_timeout: float = 5.0,
        phrase_limit: float = 5.0,
        tts_rate: int = 175,
    ):
        if fallback not in ("discard", "keep"):
            raise ValueError("fallback must be 'discard' or 'keep'")

        self.fallback = fallback
        self.listen_timeout = listen_timeout
        self.phrase_limit = phrase_limit

        # --- TTS setup ---
        if not _TTS_AVAILABLE:
            raise RuntimeError(
                "pyttsx3 not installed. Run: pip install pyttsx3"
            )
        self._tts = pyttsx3.init()
        self._tts.setProperty("rate", tts_rate)
        # Use a threading lock so speak() calls are serialized
        self._tts_lock = threading.Lock()

        # --- STR setup ---
        if not _STR_AVAILABLE:
            raise RuntimeError(
                "SpeechRecognition not installed. Run: pip install SpeechRecognition pyaudio"
            )
        self._recognizer = sr.Recognizer()
        # Calibrate once at init so ambient noise baseline is set
        try:
            with sr.Microphone() as source:
                self._recognizer.adjust_for_ambient_noise(source, duration=0.5)
        except Exception as exc:
            print(f"[VOICE] Microphone calibration warning: {exc}")

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def confirm_detection(
        self,
        event_type: str = "pothole",
        confidence: float = None,
    ) -> bool:
        """
        Run the full confirmation flow.

        Returns:
            True  → user confirmed (or fallback=="keep" after no response)
            False → user denied   (or fallback=="discard" after no response)
        """
        conf_str = f" ({confidence:.0%} confidence)" if confidence is not None else ""
        print(f"[VOICE] Prompting user for confirmation{conf_str}.")

        # --- First attempt ---
        self._speak("Was that a pothole?")
        text = self._listen()
        result = self._parse(text)

        if result == "yes":
            self._speak("Pothole confirmed. Reporting now.")
            return True
        if result == "no":
            self._speak("Got it. Detection discarded.")
            return False

        # --- Reprompt (once) ---
        print("[VOICE] Response ambiguous or missing. Reprompting.")
        self._speak(
            "Sorry, I didn't catch that. "
            "Was that a pothole? Please say yes or no."
        )
        text = self._listen()
        result = self._parse(text)

        if result == "yes":
            self._speak("Pothole confirmed. Reporting now.")
            return True
        if result == "no":
            self._speak("Got it. Detection discarded.")
            return False

        # --- Fallback ---
        print(f"[VOICE] No clear response after reprompt. Applying fallback: {self.fallback}.")
        if self.fallback == "keep":
            self._speak("No response received. Keeping detection as unconfirmed.")
            return True
        else:
            self._speak("No response received. Detection discarded.")
            return False

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _speak(self, text: str) -> None:
        """Blocking TTS playback."""
        print(f"[VOICE] Speaking: \"{text}\"")
        with self._tts_lock:
            self._tts.say(text)
            self._tts.runAndWait()

    def _listen(self) -> str | None:
        """
        Record from the default microphone and transcribe via Google STR.

        Returns:
            Lowercase transcription string, or None on failure/silence.
        """
        try:
            with sr.Microphone() as source:
                print(f"[VOICE] Listening (timeout={self.listen_timeout}s)...")
                audio = self._recognizer.listen(
                    source,
                    timeout=self.listen_timeout,
                    phrase_time_limit=self.phrase_limit,
                )
            text = self._recognizer.recognize_google(audio).lower().strip()
            print(f"[VOICE] Heard: \"{text}\"")
            return text
        except sr.WaitTimeoutError:
            print("[VOICE] No speech detected within timeout.")
            return None
        except sr.UnknownValueError:
            print("[VOICE] Speech not recognizable.")
            return None
        except sr.RequestError as exc:
            print(f"[VOICE] Speech recognition service error: {exc}")
            return None
        except Exception as exc:
            print(f"[VOICE] Unexpected listen error: {exc}")
            return None

    @staticmethod
    def _parse(text: str | None) -> str | None:
        """
        Returns 'yes', 'no', or None (ambiguous / no input).
        Checks every word in the transcription against known keyword sets.
        """
        if not text:
            return None
        words = set(text.lower().split())
        if words & AFFIRMATIVES:
            return "yes"
        if words & NEGATIVES:
            return "no"
        return None
