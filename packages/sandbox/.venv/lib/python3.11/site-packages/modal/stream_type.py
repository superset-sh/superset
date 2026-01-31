# Copyright Modal Labs 2022
import subprocess
from enum import Enum


class StreamType(Enum):
    # Discard all logs from the stream.
    DEVNULL = subprocess.DEVNULL
    # Store logs in a pipe to be read by the client.
    PIPE = subprocess.PIPE
    # Print logs to stdout immediately.
    STDOUT = subprocess.STDOUT

    def __repr__(self):
        return f"{self.__module__}.{self.__class__.__name__}.{self.name}"
