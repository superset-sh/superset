# Copyright Modal Labs 2024

import asyncio
import hashlib
from contextlib import contextmanager
from typing import BinaryIO, Callable, Optional

# Note: this module needs to import aiohttp in global scope
# This takes about 50ms and isn't needed in many cases for Modal execution
# To avoid this, we import it in local scope when needed (blob_utils.py)
from aiohttp import Payload
from aiohttp.abc import AbstractStreamWriter

# read ~16MiB chunks by default
DEFAULT_SEGMENT_CHUNK_SIZE = 2**24


class BytesIOSegmentPayload(Payload):
    """Modified bytes payload for concurrent sends of chunks from the same file.

    Adds:
    * read limit using remaining_bytes, in order to split files across streams
    * larger read chunk (to prevent excessive read contention between parts)
    * calculates an md5 for the segment

    Feels like this should be in some standard lib...
    """

    _value: BinaryIO

    def __init__(
        self,
        bytes_io: BinaryIO,  # should *not* be shared as IO position modification is not locked
        segment_start: int,
        segment_length: int,
        chunk_size: int = DEFAULT_SEGMENT_CHUNK_SIZE,
        progress_report_cb: Optional[Callable] = None,
    ):
        # not thread safe constructor!
        super().__init__(bytes_io)
        self._size = segment_length
        self.initial_seek_pos = bytes_io.tell()
        self.segment_start = segment_start
        self.segment_length = segment_length
        # seek to start of file segment we are interested in, in order to make .size() evaluate correctly
        self._value.seek(self.initial_seek_pos + segment_start)
        assert self.segment_length <= super().size
        self.chunk_size = chunk_size
        self.progress_report_cb = progress_report_cb or (lambda *_, **__: None)
        self.reset_state()

    def decode(self, encoding: str = "utf-8", errors: str = "strict") -> str:
        self._value.seek(self.initial_seek_pos)
        return self._value.read().decode(encoding, errors)

    def reset_state(self):
        self._md5_checksum = hashlib.md5()
        self.num_bytes_read = 0
        self._value.seek(self.initial_seek_pos)

    @contextmanager
    def reset_on_error(self, subtract_progress: bool = False):
        try:
            yield
        except Exception as exc:
            try:
                if subtract_progress:
                    negative_progress = -self.num_bytes_read
                    self.progress_report_cb(advance=negative_progress)
                else:
                    self.progress_report_cb(reset=True)
            except Exception as cb_exc:
                raise cb_exc from exc
            raise exc
        finally:
            self.reset_state()

    @property
    def size(self) -> int:
        return self.segment_length

    def md5_checksum(self):
        return self._md5_checksum

    async def write(self, writer: "AbstractStreamWriter"):
        # On aiohttp < 3.12.0 - this is the method that's being called on a custom payload,
        # but on aiohttp 3.12+ `write_with_length` is called directly.
        await self.write_with_length(writer, None)

    async def write_with_length(self, writer: AbstractStreamWriter, content_length: Optional[int]):
        loop = asyncio.get_event_loop()

        async def safe_read():
            read_start = self.initial_seek_pos + self.segment_start + self.num_bytes_read
            self._value.seek(read_start)
            num_bytes = min(self.chunk_size, self.remaining_bytes())
            if content_length is not None:
                num_bytes = min(num_bytes, content_length)

            chunk = await loop.run_in_executor(None, self._value.read, num_bytes)
            await loop.run_in_executor(None, self._md5_checksum.update, chunk)
            self.num_bytes_read += len(chunk)
            return chunk

        chunk = await safe_read()
        while chunk and self.remaining_bytes() > 0:
            await writer.write(chunk)
            self.progress_report_cb(advance=len(chunk))
            chunk = await safe_read()
        if chunk:
            await writer.write(chunk)
            self.progress_report_cb(advance=len(chunk))

    def remaining_bytes(self):
        return self.segment_length - self.num_bytes_read
