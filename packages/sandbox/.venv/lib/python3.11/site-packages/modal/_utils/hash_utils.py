# Copyright Modal Labs 2022
import base64
import dataclasses
import hashlib
import time
from typing import BinaryIO, Callable, Optional, Sequence, Union

from modal.config import logger

HASH_CHUNK_SIZE = 65536


def _update(hashers: Sequence[Callable[[bytes], None]], data: Union[bytes, BinaryIO]) -> None:
    if isinstance(data, bytes):
        for hasher in hashers:
            hasher(data)
    else:
        assert not isinstance(data, (bytearray, memoryview))  # https://github.com/microsoft/pyright/issues/5697
        pos = data.tell()
        while True:
            chunk = data.read(HASH_CHUNK_SIZE)
            if not isinstance(chunk, bytes):
                raise ValueError(f"Only accepts bytes or byte buffer objects, not {type(chunk)} buffers")
            if not chunk:
                break
            for hasher in hashers:
                hasher(chunk)
        data.seek(pos)


def get_sha256_hex(data: Union[bytes, BinaryIO]) -> str:
    t0 = time.monotonic()
    hasher = hashlib.sha256()
    _update([hasher.update], data)
    logger.debug("get_sha256_hex took %.3fs", time.monotonic() - t0)
    return hasher.hexdigest()


def get_sha256_base64(data: Union[bytes, BinaryIO]) -> str:
    t0 = time.monotonic()
    hasher = hashlib.sha256()
    _update([hasher.update], data)
    logger.debug("get_sha256_base64 took %.3fs", time.monotonic() - t0)
    return base64.b64encode(hasher.digest()).decode("ascii")


def get_md5_base64(data: Union[bytes, BinaryIO]) -> str:
    t0 = time.monotonic()
    hasher = hashlib.md5()
    _update([hasher.update], data)
    logger.debug("get_md5_base64 took %.3fs", time.monotonic() - t0)
    return base64.b64encode(hasher.digest()).decode("utf-8")


@dataclasses.dataclass
class UploadHashes:
    md5_base64: str
    sha256_base64: str

    def md5_hex(self) -> str:
        return base64.b64decode(self.md5_base64).hex()

    def sha256_hex(self) -> str:
        return base64.b64decode(self.sha256_base64).hex()


def get_upload_hashes(
    data: Union[bytes, BinaryIO], sha256_hex: Optional[str] = None, md5_hex: Optional[str] = None
) -> UploadHashes:
    t0 = time.monotonic()
    hashers = {}

    if not sha256_hex:
        sha256 = hashlib.sha256()
        hashers["sha256"] = sha256
    if not md5_hex:
        md5 = hashlib.md5()
        hashers["md5"] = md5

    if hashers:
        updaters = [h.update for h in hashers.values()]
        _update(updaters, data)

    if sha256_hex:
        sha256_base64 = base64.b64encode(bytes.fromhex(sha256_hex)).decode("ascii")
    else:
        sha256_base64 = base64.b64encode(hashers["sha256"].digest()).decode("ascii")

    if md5_hex:
        md5_base64 = base64.b64encode(bytes.fromhex(md5_hex)).decode("ascii")
    else:
        md5_base64 = base64.b64encode(hashers["md5"].digest()).decode("ascii")

    hashes = UploadHashes(
        md5_base64=md5_base64,
        sha256_base64=sha256_base64,
    )

    logger.debug("get_upload_hashes took %.3fs (%s)", time.monotonic() - t0, hashers.keys())
    return hashes
