import enum
import time

import numpy as np

from config import Config


class CaptureStatus(enum.Enum):
    CAPTURING = "capturing"
    SPEECH_ENDED = "speech_ended"
    MAX_DURATION = "max_duration"


class SpeechCapture:
    """Accumulates audio after wake word trigger, detects silence to end capture."""

    def __init__(self, config: Config) -> None:
        self._config = config
        self._buffers: list[np.ndarray] = []
        self._start_time: float = 0.0
        self._last_speech_time: float = 0.0
        self._active = False

    def start(self) -> None:
        """Begin a new speech capture session."""
        self._buffers = []
        self._start_time = time.perf_counter()
        self._last_speech_time = self._start_time
        self._active = True

    def add_prebuffer(self, chunk: np.ndarray) -> None:
        """Add a pre-buffered chunk (audio only, no silence detection)."""
        if not self._active:
            raise RuntimeError("Capture not started. Call start() first.")
        self._buffers.append(chunk.copy())

    def add_chunk(self, chunk: np.ndarray) -> CaptureStatus:
        """Add a live chunk and return the current capture status."""
        if not self._active:
            raise RuntimeError("Capture not started. Call start() first.")

        self._buffers.append(chunk.copy())
        now = time.perf_counter()
        elapsed = now - self._start_time

        if elapsed >= self._config.max_speech_duration_s:
            self._active = False
            return CaptureStatus.MAX_DURATION

        rms = np.sqrt(np.mean(chunk.astype(np.float64) ** 2))
        if rms > self._config.silence_threshold_rms:
            self._last_speech_time = now

        if elapsed < self._config.min_capture_s:
            return CaptureStatus.CAPTURING

        silence_duration = now - self._last_speech_time
        if silence_duration >= self._config.silence_duration_s:
            self._active = False
            return CaptureStatus.SPEECH_ENDED

        return CaptureStatus.CAPTURING

    def get_audio(self) -> np.ndarray:
        """Return all captured audio as a single array."""
        if not self._buffers:
            return np.array([], dtype=np.int16)
        return np.concatenate(self._buffers).flatten()

    @property
    def duration_s(self) -> float:
        if not self._buffers:
            return 0.0
        total_samples = sum(b.size for b in self._buffers)
        return total_samples / self._config.sample_rate
