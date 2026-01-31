# Copyright Modal Labs 2023
import asyncio
import functools
import multiprocessing
import os
import shutil
import sys
from collections.abc import AsyncIterator
from pathlib import Path, PurePosixPath
from typing import Callable, Optional, Union

from click import UsageError

from modal._utils.async_utils import TaskContext
from modal.config import logger
from modal.network_file_system import _NetworkFileSystem
from modal.volume import FileEntry, FileEntryType, _Volume

PIPE_PATH = Path("-")


async def _volume_download(
    volume: Union[_NetworkFileSystem, _Volume],
    remote_path: str,
    local_destination: Path,
    overwrite: bool,
    concurrency: Optional[int] = None,
    progress_cb: Optional[Callable] = None,
):
    if progress_cb is None:

        def progress_cb(*_, **__):
            pass

    if concurrency is None:
        concurrency = max(128, 2 * multiprocessing.cpu_count())

    is_pipe = local_destination == PIPE_PATH

    q: asyncio.Queue[tuple[Optional[Path], Optional[FileEntry]]] = asyncio.Queue()
    num_consumers = 1 if is_pipe else concurrency  # concurrency limit for downloading files
    download_semaphore = asyncio.Semaphore(concurrency)

    async def producer():
        iterator: AsyncIterator[FileEntry]
        if isinstance(volume, _Volume):
            iterator = volume.iterdir(remote_path, recursive=True)
        else:
            iterator = volume.iterdir(remote_path)  # NFS still supports "glob" paths

        async for entry in iterator:
            if is_pipe:
                await q.put((None, entry))
            else:
                start_path = Path(remote_path).parent.as_posix().split("*")[0]
                rel_path = PurePosixPath(entry.path).relative_to(start_path.lstrip("/"))
                if local_destination.is_dir():
                    output_path = local_destination / rel_path
                else:
                    output_path = local_destination
                if output_path.exists():
                    if overwrite:
                        if output_path.is_file():
                            os.remove(output_path)
                        else:
                            shutil.rmtree(output_path)
                    else:
                        raise UsageError(
                            f"Output path '{output_path}' already exists. Use --force to overwrite the output directory"
                        )
                await q.put((output_path, entry))
        # No more entries to process; issue one shutdown message for each consumer.
        for _ in range(num_consumers):
            await q.put((None, None))

    async def consumer():
        while True:
            output_path, entry = await q.get()
            if entry is None:
                return
            try:
                if is_pipe:
                    if entry.type == FileEntryType.FILE:
                        progress_task_id = progress_cb(name=entry.path, size=entry.size)
                        file_progress_cb = functools.partial(progress_cb, task_id=progress_task_id)

                        async for chunk in volume.read_file(entry.path):
                            sys.stdout.buffer.write(chunk)
                            file_progress_cb(advance=len(chunk))

                        file_progress_cb(complete=True)
                else:
                    if entry.type == FileEntryType.FILE:
                        progress_task_id = progress_cb(name=entry.path, size=entry.size)
                        output_path.parent.mkdir(parents=True, exist_ok=True)
                        file_progress_cb = functools.partial(progress_cb, task_id=progress_task_id)

                        with output_path.open("wb") as fp:
                            if isinstance(volume, _Volume):
                                b = await volume._read_file_into_fileobj(
                                    path=entry.path,
                                    fileobj=fp,
                                    download_semaphore=download_semaphore,
                                    progress_cb=file_progress_cb,
                                )
                            else:
                                b = 0
                                async for chunk in volume.read_file(entry.path):
                                    b += fp.write(chunk)
                                    file_progress_cb(advance=len(chunk))

                        logger.debug(f"Wrote {b} bytes to {output_path}")
                        file_progress_cb(complete=True)
                    elif entry.type == FileEntryType.DIRECTORY:
                        output_path.mkdir(parents=True, exist_ok=True)
            finally:
                q.task_done()

    consumers = [consumer() for _ in range(num_consumers)]
    await TaskContext.gather(producer(), *consumers)
    progress_cb(complete=True)
    sys.stdout.flush()
