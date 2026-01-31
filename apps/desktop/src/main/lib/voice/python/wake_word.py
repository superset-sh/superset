from dataclasses import dataclass
from typing import Optional

import numpy as np
from openwakeword.model import Model

from config import Config


@dataclass
class WakeWordResult:
    detected: bool
    confidence: float


class WakeWordDetector:
    """Wraps openwakeword for wake word detection."""

    def __init__(self, config: Config) -> None:
        self._config = config
        self._model: Optional[Model] = None

    def load(self) -> None:
        self._model = Model(
            wakeword_models=[self._config.wake_word_model],
            inference_framework="onnx",
        )

    def process_chunk(self, chunk: np.ndarray) -> WakeWordResult:
        """Process an audio chunk and return detection result."""
        if self._model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        audio = chunk.flatten().astype(np.int16)
        self._model.predict(audio)

        scores = self._model.prediction_buffer.get(self._config.wake_word_model, [])
        confidence = scores[-1] if scores else 0.0
        detected = confidence >= self._config.wake_word_threshold

        return WakeWordResult(detected=detected, confidence=confidence)

    def reset(self) -> None:
        """Reset the model's prediction buffer for a new detection cycle."""
        if self._model is not None:
            self._model.reset()
