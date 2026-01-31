import queue
from typing import Optional

import numpy as np
import sounddevice as sd

from config import Config


class AudioStream:
    """Context manager for capturing audio from the microphone."""

    def __init__(self, config: Config) -> None:
        self._config = config
        self._queue: queue.Queue[np.ndarray] = queue.Queue()
        self._stream: Optional[sd.InputStream] = None

    def _callback(
        self,
        indata: np.ndarray,
        frames: int,
        time_info: object,
        status: sd.CallbackFlags,
    ) -> None:
        if status:
            _emit_error(f"audio callback: {status}")
        self._queue.put(indata.copy())

    def read_chunk(self, timeout: float = 2.0) -> Optional[np.ndarray]:
        """Read the next audio chunk from the queue. Returns None on timeout."""
        try:
            return self._queue.get(timeout=timeout)
        except queue.Empty:
            return None

    def __enter__(self) -> "AudioStream":
        self._stream = sd.InputStream(
            samplerate=self._config.sample_rate,
            channels=self._config.channels,
            dtype=self._config.dtype,
            blocksize=self._config.chunk_size,
            callback=self._callback,
        )
        self._stream.start()
        return self

    def __exit__(self, *exc: object) -> None:
        if self._stream is not None:
            self._stream.stop()
            self._stream.close()
            self._stream = None


def _emit_error(message: str) -> None:
    """Helper to emit error via stdout JSON (imported lazily to avoid circular imports)."""
    import json
    import sys

    sys.stdout.write(json.dumps({"event": "error", "message": message}) + "\n")
    sys.stdout.flush()
