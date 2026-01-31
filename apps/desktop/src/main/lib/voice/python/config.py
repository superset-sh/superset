from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    # Audio
    sample_rate: int = 16000
    channels: int = 1
    dtype: str = "int16"
    chunk_duration_ms: int = 80
    chunk_size: int = 0  # computed in __post_init__

    # Wake word
    wake_word_model: str = "hey_jarvis"
    wake_word_threshold: float = 0.5

    # Speech capture
    pre_buffer_chunks: int = 63  # ~5s of audio to carry over into speech capture
    min_capture_s: float = 1.5  # don't end capture until this much live time has passed
    silence_threshold_rms: float = 200.0
    silence_duration_s: float = 1.5
    max_speech_duration_s: float = 30.0

    def __post_init__(self) -> None:
        computed = int(self.sample_rate * self.chunk_duration_ms / 1000)
        object.__setattr__(self, "chunk_size", computed)
