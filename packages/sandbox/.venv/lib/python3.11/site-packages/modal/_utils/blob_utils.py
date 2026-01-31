# Copyright Modal Labs 2022
import asyncio
import dataclasses
import hashlib
import os
import platform
import time
from collections.abc import AsyncIterator
from contextlib import AbstractContextManager, contextmanager
from io import BytesIO, FileIO
from pathlib import Path, PurePosixPath
from typing import (
    TYPE_CHECKING,
    Any,
    BinaryIO,
    Callable,
    ContextManager,
    Optional,
    Union,
    cast,
)
from urllib.parse import urlparse

from modal_proto import api_pb2
from modal_proto.modal_api_grpc import ModalClientModal

from ..exception import ExecutionError
from .async_utils import TaskContext, retry
from .hash_utils import UploadHashes, get_upload_hashes
from .http_utils import ClientSessionRegistry
from .logger import logger

if TYPE_CHECKING:
    from .bytes_io_segment_payload import BytesIOSegmentPayload

# Max size for function inputs and outputs.
MAX_OBJECT_SIZE_BYTES = 2 * 1024 * 1024  # 2 MiB

# Max size for async function inputs and outputs.
MAX_ASYNC_OBJECT_SIZE_BYTES = 8 * 1024  # 8 KiB

#  If a file is LARGE_FILE_LIMIT bytes or larger, it's uploaded to blob store (s3) instead of going through grpc
#  It will also make sure to chunk the hash calculation to avoid reading the entire file into memory
LARGE_FILE_LIMIT = 4 * 1024 * 1024  # 4 MiB

# Max parallelism during map calls
BLOB_MAX_PARALLELISM = 20

# read ~16MiB chunks by default
DEFAULT_SEGMENT_CHUNK_SIZE = 2**24

# Files larger than this will be multipart uploaded. The server might request multipart upload for smaller files as
# well, but the limit will never be raised.
# TODO(dano): remove this once we stop requiring md5 for blobs
MULTIPART_UPLOAD_THRESHOLD = 1024**3

# For block based storage like volumefs2: the size of a block
BLOCK_SIZE: int = 8 * 1024 * 1024


@retry(n_attempts=3, base_delay=0.3, timeout=None)
async def _upload_to_s3_url(
    upload_url,
    payload: "BytesIOSegmentPayload",
    content_md5_b64: Optional[str] = None,
    content_type: Optional[str] = "application/octet-stream",  # set to None to force omission of ContentType header
) -> str:
    """Returns etag of s3 object which is a md5 hex checksum of the uploaded content"""
    with payload.reset_on_error():  # ensure retries read the same data
        headers = {}
        if content_md5_b64 and use_md5(upload_url):
            headers["Content-MD5"] = content_md5_b64
        if content_type:
            headers["Content-Type"] = content_type

        async with ClientSessionRegistry.get_session().put(
            upload_url,
            data=payload,
            headers=headers,
            skip_auto_headers=["content-type"] if content_type is None else [],
        ) as resp:
            # S3 signal to slow down request rate.
            if resp.status == 503:
                logger.debug("Received SlowDown signal from S3, sleeping for 1 second before retrying.")
                await asyncio.sleep(1)

            if resp.status != 200:
                try:
                    text = await resp.text()
                except Exception:
                    text = "<no body>"
                raise ExecutionError(f"Put to url {upload_url} failed with status {resp.status}: {text}")

            # client side ETag checksum verification
            # the s3 ETag of a single part upload is a quoted md5 hex of the uploaded content
            etag = resp.headers["ETag"].strip()
            if etag.startswith(("W/", "w/")):  # see https://www.rfc-editor.org/rfc/rfc7232#section-2.3
                etag = etag[2:]
            if etag[0] == '"' and etag[-1] == '"':
                etag = etag[1:-1]
            remote_md5 = etag

            local_md5_hex = payload.md5_checksum().hexdigest()
            if local_md5_hex != remote_md5:
                raise ExecutionError(f"Local data and remote data checksum mismatch ({local_md5_hex} vs {remote_md5})")

            return remote_md5


async def perform_multipart_upload(
    data_file: Union[BinaryIO, BytesIO, FileIO],
    *,
    content_length: int,
    max_part_size: int,
    part_urls: list[str],
    completion_url: str,
    upload_chunk_size: int = DEFAULT_SEGMENT_CHUNK_SIZE,
    progress_report_cb: Optional[Callable] = None,
) -> None:
    from .bytes_io_segment_payload import BytesIOSegmentPayload

    upload_coros = []
    file_offset = 0
    num_bytes_left = content_length

    # Give each part its own IO reader object to avoid needing to
    # lock access to the reader's position pointer.
    data_file_readers: list[BinaryIO]
    if isinstance(data_file, BytesIO):
        view = data_file.getbuffer()  # does not copy data
        data_file_readers = [BytesIO(view) for _ in range(len(part_urls))]
    else:
        filename = data_file.name
        data_file_readers = [open(filename, "rb") for _ in range(len(part_urls))]

    for part_number, (data_file_rdr, part_url) in enumerate(zip(data_file_readers, part_urls), start=1):
        part_length_bytes = min(num_bytes_left, max_part_size)
        part_payload = BytesIOSegmentPayload(
            data_file_rdr,
            segment_start=file_offset,
            segment_length=part_length_bytes,
            chunk_size=upload_chunk_size,
            progress_report_cb=progress_report_cb,
        )
        upload_coros.append(_upload_to_s3_url(part_url, payload=part_payload, content_type=None))
        num_bytes_left -= part_length_bytes
        file_offset += part_length_bytes

    part_etags = await TaskContext.gather(*upload_coros)

    # The body of the complete_multipart_upload command needs some data in xml format:
    completion_parts = ["<CompleteMultipartUpload>"]
    for part_number, etag in enumerate(part_etags, 1):
        completion_parts.append(f"""<Part>\n<PartNumber>{part_number}</PartNumber>\n<ETag>"{etag}"</ETag>\n</Part>""")
    completion_parts.append("</CompleteMultipartUpload>")
    completion_body = "\n".join(completion_parts)

    # etag of combined object should be md5 hex of concatenated md5 *bytes* from parts + `-{num_parts}`
    bin_hash_parts = [bytes.fromhex(etag) for etag in part_etags]

    expected_multipart_etag = hashlib.md5(b"".join(bin_hash_parts)).hexdigest() + f"-{len(part_etags)}"
    resp = await ClientSessionRegistry.get_session().post(
        completion_url, data=completion_body.encode("ascii"), skip_auto_headers=["content-type"]
    )
    if resp.status != 200:
        try:
            msg = await resp.text()
        except Exception:
            msg = "<no body>"
        raise ExecutionError(f"Error when completing multipart upload: {resp.status}\n{msg}")
    else:
        response_body = await resp.text()
        if expected_multipart_etag not in response_body:
            raise ExecutionError(
                f"Hash mismatch on multipart upload assembly: {expected_multipart_etag} not in {response_body}"
            )


def get_content_length(data: BinaryIO) -> int:
    # *Remaining* length of file from current seek position
    pos = data.tell()
    data.seek(0, os.SEEK_END)
    content_length = data.tell()
    data.seek(pos)
    return content_length - pos


async def _blob_upload_with_fallback(
    items, blob_ids: list[str], callback, content_length: int
) -> tuple[str, bool, int]:
    """Try uploading to each provider in order, with fallback on failure."""
    r2_throughput_bytes_s = 0
    r2_failed = False
    for idx, (item, blob_id) in enumerate(zip(items, blob_ids)):
        try:
            if blob_id.endswith(":r2"):
                t0 = time.monotonic_ns()
                await callback(item)
                dt_ns = time.monotonic_ns() - t0
                r2_throughput_bytes_s = (content_length * 1_000_000_000) // max(dt_ns, 1)
            else:
                await callback(item)
            return blob_id, r2_failed, r2_throughput_bytes_s
        except Exception:
            if blob_id.endswith(":r2"):
                r2_failed = True
            # Ignore all errors except the last one, since we're out of fallback options.
            if idx == len(items) - 1:
                raise
    raise ExecutionError("Failed to upload blob")


async def _blob_upload(
    upload_hashes: UploadHashes, data: Union[bytes, BinaryIO], stub, progress_report_cb: Optional[Callable] = None
) -> tuple[str, bool, int]:
    if isinstance(data, bytes):
        data = BytesIO(data)

    content_length = get_content_length(data)

    req = api_pb2.BlobCreateRequest(
        content_md5=upload_hashes.md5_base64,
        content_sha256_base64=upload_hashes.sha256_base64,
        content_length=content_length,
    )
    resp = await stub.BlobCreate(req)

    if resp.WhichOneof("upload_types_oneof") == "multiparts":

        async def upload_multipart_upload(part):
            return await perform_multipart_upload(
                data,
                content_length=content_length,
                max_part_size=part.part_length,
                part_urls=part.upload_urls,
                completion_url=part.completion_url,
                upload_chunk_size=DEFAULT_SEGMENT_CHUNK_SIZE,
                progress_report_cb=progress_report_cb,
            )

        blob_id, r2_failed, r2_throughput_bytes_s = await _blob_upload_with_fallback(
            resp.multiparts.items,
            resp.blob_ids,
            upload_multipart_upload,
            content_length=content_length,
        )
    else:
        from .bytes_io_segment_payload import BytesIOSegmentPayload

        payload = BytesIOSegmentPayload(
            data, segment_start=0, segment_length=content_length, progress_report_cb=progress_report_cb
        )

        async def upload_to_s3_url(url):
            return await _upload_to_s3_url(
                url,
                payload,
                # for single part uploads, we use server side md5 checksums
                content_md5_b64=upload_hashes.md5_base64,
            )

        blob_id, r2_failed, r2_throughput_bytes_s = await _blob_upload_with_fallback(
            resp.upload_urls.items,
            resp.blob_ids,
            upload_to_s3_url,
            content_length=content_length,
        )

    if progress_report_cb:
        progress_report_cb(complete=True)

    return blob_id, r2_failed, r2_throughput_bytes_s


async def blob_upload_with_r2_failure_info(payload: bytes, stub: ModalClientModal) -> tuple[str, bool, int]:
    size_mib = len(payload) / 1024 / 1024
    logger.debug(f"Uploading large blob of size {size_mib:.2f} MiB")
    t0 = time.time()
    if isinstance(payload, str):
        logger.debug("Blob uploading string, not bytes - auto-encoding as utf8")
        payload = payload.encode("utf8")
    upload_hashes = get_upload_hashes(payload)
    blob_id, r2_failed, r2_throughput_bytes_s = await _blob_upload(upload_hashes, payload, stub)
    dur_s = max(time.time() - t0, 0.001)  # avoid division by zero
    throughput_mib_s = (size_mib) / dur_s
    logger.debug(
        f"Uploaded large blob of size {size_mib:.2f} MiB ({throughput_mib_s:.2f} MiB/s, total {dur_s:.2f}s). {blob_id}"
    )
    return blob_id, r2_failed, r2_throughput_bytes_s


async def blob_upload(payload: bytes, stub: ModalClientModal) -> str:
    blob_id, _, _ = await blob_upload_with_r2_failure_info(payload, stub)
    return blob_id


async def format_blob_data(data: bytes, api_stub: ModalClientModal) -> dict[str, Any]:
    return {"data_blob_id": await blob_upload(data, api_stub)} if len(data) > MAX_OBJECT_SIZE_BYTES else {"data": data}


async def blob_upload_file(
    file_obj: BinaryIO,
    stub: ModalClientModal,
    progress_report_cb: Optional[Callable] = None,
    sha256_hex: Optional[str] = None,
    md5_hex: Optional[str] = None,
) -> str:
    upload_hashes = get_upload_hashes(file_obj, sha256_hex=sha256_hex, md5_hex=md5_hex)
    blob_id, _, _ = await _blob_upload(upload_hashes, file_obj, stub, progress_report_cb)
    return blob_id


@retry(n_attempts=5, base_delay=0.1, timeout=None)
async def _download_from_url(download_url: str) -> bytes:
    async with ClientSessionRegistry.get_session().get(download_url) as s3_resp:
        # S3 signal to slow down request rate.
        if s3_resp.status == 503:
            logger.debug("Received SlowDown signal from S3, sleeping for 1 second before retrying.")
            await asyncio.sleep(1)

        if s3_resp.status != 200:
            text = await s3_resp.text()
            raise ExecutionError(f"Get from url failed with status {s3_resp.status}: {text}")
        return await s3_resp.read()


async def blob_download(blob_id: str, stub: ModalClientModal) -> bytes:
    """Convenience function for reading all of the downloaded file into memory."""
    logger.debug(f"Downloading large blob {blob_id}")
    t0 = time.time()
    req = api_pb2.BlobGetRequest(blob_id=blob_id)
    resp = await stub.BlobGet(req)
    data = await _download_from_url(resp.download_url)
    size_mib = len(data) / 1024 / 1024
    dur_s = max(time.time() - t0, 0.001)  # avoid division by zero
    throughput_mib_s = size_mib / dur_s
    logger.debug(
        f"Downloaded large blob {blob_id} of size {size_mib:.2f} MiB ({throughput_mib_s:.2f} MiB/s, total {dur_s:.2f}s)"
    )
    return data


async def blob_iter(blob_id: str, stub: ModalClientModal) -> AsyncIterator[bytes]:
    req = api_pb2.BlobGetRequest(blob_id=blob_id)
    resp = await stub.BlobGet(req)
    download_url = resp.download_url
    async with ClientSessionRegistry.get_session().get(download_url) as s3_resp:
        # S3 signal to slow down request rate.
        if s3_resp.status == 503:
            logger.debug("Received SlowDown signal from S3, sleeping for 1 second before retrying.")
            await asyncio.sleep(1)

        if s3_resp.status != 200:
            text = await s3_resp.text()
            raise ExecutionError(f"Get from url failed with status {s3_resp.status}: {text}")

        async for chunk in s3_resp.content.iter_any():
            yield chunk


@dataclasses.dataclass
class FileUploadSpec:
    source: Callable[[], Union[AbstractContextManager, BinaryIO]]
    source_description: Any
    source_is_path: bool
    mount_filename: str

    use_blob: bool
    sha256_hex: str
    md5_hex: str
    mode: int  # file permission bits (last 12 bits of st_mode)
    size: int
    content: Optional[bytes] = None  # Set for very small files to avoid double-read

    def read_content(self) -> bytes:
        """Read content from source."""
        with self.source() as fp:
            fp.seek(0)
            return fp.read()


def _get_file_upload_spec(
    source: Callable[[], Union[AbstractContextManager, BinaryIO]],
    source_description: Any,
    mount_filename: PurePosixPath,
    mode: int,
) -> FileUploadSpec:
    content = None
    with source() as fp:
        # Current position is ignored - we always upload from position 0
        fp.seek(0, os.SEEK_END)
        size = fp.tell()
        fp.seek(0)

        if size >= LARGE_FILE_LIMIT:
            # TODO(dano): remove the placeholder md5 once we stop requiring md5 for blobs
            md5_hex = "baadbaadbaadbaadbaadbaadbaadbaad" if size > MULTIPART_UPLOAD_THRESHOLD else None
            use_blob = True
            hashes = get_upload_hashes(fp, md5_hex=md5_hex)
        else:
            use_blob = False
            # For very small files (< 256 KiB), read content once and cache it
            # This avoids double-read penalty while limiting memory usage
            if size < 256 * 1024:  # 256 KiB threshold
                fp.seek(0)
                content = fp.read()
                hashes = get_upload_hashes(content)
            else:
                # For medium files (256 KiB - 4 MiB), compute hashes without caching content
                hashes = get_upload_hashes(fp)

    return FileUploadSpec(
        source=source,
        source_description=source_description,
        source_is_path=isinstance(source_description, Path),
        mount_filename=mount_filename.as_posix(),
        use_blob=use_blob,
        sha256_hex=hashes.sha256_hex(),
        md5_hex=hashes.md5_hex(),
        mode=mode & 0o7777,
        size=size,
        content=content,
    )


def get_file_upload_spec_from_path(
    filename: Path, mount_filename: PurePosixPath, mode: Optional[int] = None
) -> FileUploadSpec:
    # Python appears to give files 0o666 bits on Windows (equal for user, group, and global),
    # so we mask those out to 0o755 for compatibility with POSIX-based permissions.
    mode = mode or os.stat(filename).st_mode & (0o7777 if platform.system() != "Windows" else 0o7755)
    return _get_file_upload_spec(
        lambda: open(filename, "rb"),
        filename,
        mount_filename,
        mode,
    )


def get_file_upload_spec_from_fileobj(fp: BinaryIO, mount_filename: PurePosixPath, mode: int) -> FileUploadSpec:
    @contextmanager
    def source():
        # We ignore position in stream and always upload from position 0
        fp.seek(0)
        yield fp

    return _get_file_upload_spec(
        source,
        str(fp),
        mount_filename,
        mode,
    )


_FileUploadSource2 = Callable[[], ContextManager[BinaryIO]]


@dataclasses.dataclass
class FileUploadBlock:
    # The start (byte offset, inclusive) of the block within the file
    start: int
    # The end (byte offset, exclusive) of the block, after having removed any trailing zeroes
    end: int
    # Raw (unencoded 32 byte) SHA256 sum of the block, not including trailing zeroes
    contents_sha256: bytes


@dataclasses.dataclass
class FileUploadSpec2:
    source: _FileUploadSource2
    source_description: Union[str, Path]

    path: str
    # 8MiB file blocks
    blocks: list[FileUploadBlock]
    mode: int  # file permission bits (last 12 bits of st_mode)
    size: int

    @staticmethod
    async def from_path(
        filename: Path,
        mount_filename: PurePosixPath,
        hash_semaphore: asyncio.Semaphore,
        mode: Optional[int] = None,
    ) -> "FileUploadSpec2":
        # Python appears to give files 0o666 bits on Windows (equal for user, group, and global),
        # so we mask those out to 0o755 for compatibility with POSIX-based permissions.
        mode = mode or os.stat(filename).st_mode & (0o7777 if platform.system() != "Windows" else 0o7755)

        def source():
            return open(filename, "rb")

        return await FileUploadSpec2._create(
            source,
            filename,
            mount_filename,
            mode,
            hash_semaphore,
        )

    @staticmethod
    async def from_fileobj(
        source_fp: Union[BinaryIO, BytesIO],
        mount_filename: PurePosixPath,
        hash_semaphore: asyncio.Semaphore,
        mode: int,
    ) -> "FileUploadSpec2":
        try:
            fileno = source_fp.fileno()

            def source():
                new_fd = os.dup(fileno)
                fp = os.fdopen(new_fd, "rb")
                fp.seek(0)
                return fp

        except OSError:
            # `.fileno()` not available; assume BytesIO-like type
            source_fp = cast(BytesIO, source_fp)
            buffer = source_fp.getbuffer()

            def source():
                return BytesIO(buffer)

        return await FileUploadSpec2._create(
            source,
            str(source),
            mount_filename,
            mode,
            hash_semaphore,
        )

    @staticmethod
    async def _create(
        source: _FileUploadSource2,
        source_description: Union[str, Path],
        mount_filename: PurePosixPath,
        mode: int,
        hash_semaphore: asyncio.Semaphore,
    ) -> "FileUploadSpec2":
        # Current position is ignored - we always upload from position 0
        with source() as source_fp:
            source_fp.seek(0, os.SEEK_END)
            size = source_fp.tell()

        blocks = await _gather_blocks(source, size, hash_semaphore)

        return FileUploadSpec2(
            source=source,
            source_description=source_description,
            path=mount_filename.as_posix(),
            blocks=blocks,
            mode=mode & 0o7777,
            size=size,
        )


async def _gather_blocks(
    source: _FileUploadSource2,
    size: int,
    hash_semaphore: asyncio.Semaphore,
) -> list[FileUploadBlock]:
    def ceildiv(a: int, b: int) -> int:
        return -(a // -b)

    num_blocks = ceildiv(size, BLOCK_SIZE)

    async def gather_block(block_idx: int) -> FileUploadBlock:
        async with hash_semaphore:
            return await asyncio.to_thread(_gather_block, source, block_idx)

    tasks = (gather_block(idx) for idx in range(num_blocks))
    return await asyncio.gather(*tasks)


def _gather_block(source: _FileUploadSource2, block_idx: int) -> FileUploadBlock:
    start = block_idx * BLOCK_SIZE
    end = _find_end_of_block(source, start, start + BLOCK_SIZE)
    contents_sha256 = _hash_range_sha256(source, start, end)
    return FileUploadBlock(start=start, end=end, contents_sha256=contents_sha256)


def _hash_range_sha256(source: _FileUploadSource2, start, end):
    sha256_hash = hashlib.sha256()
    range_size = end - start

    with source() as fp:
        fp.seek(start)

        num_bytes_read = 0
        while num_bytes_read < range_size:
            chunk = fp.read(range_size - num_bytes_read)

            if not chunk:
                break

            num_bytes_read += len(chunk)
            sha256_hash.update(chunk)

    return sha256_hash.digest()


def _find_end_of_block(source: _FileUploadSource2, start: int, end: int) -> Optional[int]:
    """Finds the appropriate end of a block, which is the index of the byte just past the last non-zero byte in the
    block.

    >>> _find_end_of_block(lambda: BytesIO(b"abc123\0\0\0"), 0, 1024)
    6
    >>> _find_end_of_block(lambda: BytesIO(b"abc123\0\0\0"), 3, 1024)
    6
    >>> _find_end_of_block(lambda: BytesIO(b"abc123\0\0\0"), 0, 3)
    4
    >>> _find_end_of_block(lambda: BytesIO(b"abc123\0\0\0a"), 0, 9)
    6
    >>> _find_end_of_block(lambda: BytesIO(b"\0\0\0"), 0, 3)
    0
    >>> _find_end_of_block(lambda: BytesIO(b"\0\0\0\0\0\0"), 3, 6)
    3
    >>> _find_end_of_block(lambda: BytesIO(b""), 0, 1024)
    0
    """
    size = end - start
    new_end = start

    with source() as block_fp:
        block_fp.seek(start)

        num_bytes_read = 0
        while num_bytes_read < size:
            chunk = block_fp.read(size - num_bytes_read)

            if not chunk:
                break

            stripped_chunk = chunk.rstrip(b"\0")
            if stripped_chunk:
                new_end = start + num_bytes_read + len(stripped_chunk)

            num_bytes_read += len(chunk)

    return new_end


def use_md5(url: str) -> bool:
    """This takes an upload URL in S3 and returns whether we should attach a checksum.

    It's only a workaround for missing functionality in moto.
    https://github.com/spulec/moto/issues/816
    """
    host = urlparse(url).netloc.split(":")[0]
    if host.endswith(".amazonaws.com") or host.endswith(".r2.cloudflarestorage.com"):
        return True
    elif host in ["127.0.0.1", "localhost", "172.21.0.1"]:
        return False
    else:
        raise Exception(f"Unknown S3 host: {host}")
