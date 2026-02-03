"""
Voice sidecar process — wake word detection + audio capture.

Communicates with the parent Node.js process via stdio JSON lines.

Stdout events:
  {"event": "ready"}
  {"event": "recording"}
  {"event": "audio_captured", "audio_b64": "<base64 WAV>", "duration_s": 3.2}
  {"event": "error", "message": "..."}
  {"event": "idle"}

Stdin commands:
  {"cmd": "start"}
  {"cmd": "stop"}
"""

import base64
import collections
import io
import json
import sys
import threading
import time
import wave
from typing import Any

import numpy as np

from audio import AudioStream
from config import Config
from speech_capture import CaptureStatus, SpeechCapture
from wake_word import WakeWordDetector


def emit(event: str, **kwargs: Any) -> None:
    """Write a JSON event to stdout."""
    msg = {"event": event, **kwargs}
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def to_wav_b64(audio: np.ndarray, config: Config) -> str:
    """Convert int16 numpy array to base64-encoded WAV."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(config.channels)
        wf.setsampwidth(2)  # 16-bit = 2 bytes
        wf.setframerate(config.sample_rate)
        wf.writeframes(audio.tobytes())
    return base64.b64encode(buf.getvalue()).decode("ascii")


def stdin_reader(stop_event: threading.Event) -> None:
    """Read stdin commands in a background thread."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
            if cmd.get("cmd") == "stop":
                stop_event.set()
        except json.JSONDecodeError as e:
            print(f"[stdin] Invalid JSON: {e}", file=sys.stderr)


def main() -> None:
    config = Config()

    # Load wake word model
    detector = WakeWordDetector(config)
    try:
        detector.load()
    except Exception as e:
        emit("error", message=f"Failed to load wake word model: {e}")
        sys.exit(1)

    capturer = SpeechCapture(config)

    # Listen for stop commands from parent process
    stop_event = threading.Event()
    stdin_thread = threading.Thread(target=stdin_reader, args=(stop_event,), daemon=True)
    stdin_thread.start()

    emit("ready")

    pre_buffer: collections.deque[Any] = collections.deque(maxlen=config.pre_buffer_chunks)

    try:
        with AudioStream(config) as stream:
            emit("idle")

            while not stop_event.is_set():
                chunk = stream.read_chunk()
                if chunk is None:
                    continue

                pre_buffer.append(chunk.copy())

                # Wake word detection
                result = detector.process_chunk(chunk)
                if not result.detected:
                    continue

                # Speech capture
                emit("recording")
                capturer.start()
                for buffered_chunk in pre_buffer:
                    capturer.add_prebuffer(buffered_chunk)
                pre_buffer.clear()

                while not stop_event.is_set():
                    audio_chunk = stream.read_chunk()
                    if audio_chunk is None:
                        continue
                    status = capturer.add_chunk(audio_chunk)
                    if status != CaptureStatus.CAPTURING:
                        break

                speech_audio = capturer.get_audio()

                if speech_audio.size == 0:
                    emit("idle")
                    detector.reset()
                    continue

                # Convert to WAV and emit
                audio_b64 = to_wav_b64(speech_audio, config)
                emit(
                    "audio_captured",
                    audio_b64=audio_b64,
                    duration_s=round(capturer.duration_s, 2),
                )

                # Reset for next cycle
                detector.reset()
                time.sleep(0.5)
                emit("idle")

    except Exception as e:
        emit("error", message=str(e))


if __name__ == "__main__":
    main()
