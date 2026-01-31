# Copyright Modal Labs 2023
import asyncio
import builtins
import concurrent.futures
import enum
import functools
import multiprocessing
import os
import platform
import re
import sys
import time
import typing
from collections.abc import AsyncGenerator, AsyncIterator, Generator, Sequence
from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
from pathlib import Path, PurePosixPath
from typing import (
    Any,
    Awaitable,
    BinaryIO,
    Callable,
    Optional,
    Union,
)

from google.protobuf.message import Message
from synchronicity import classproperty
from synchronicity.async_wrap import asynccontextmanager

import modal.exception
import modal_proto.api_pb2
from modal.exception import AlreadyExistsError, ConflictError, InvalidError, NotFoundError, VolumeUploadTimeoutError
from modal_proto import api_pb2

from ._load_context import LoadContext
from ._object import (
    EPHEMERAL_OBJECT_HEARTBEAT_SLEEP,
    _get_environment_name,
    _Object,
    live_method,
    live_method_contextmanager,
    live_method_gen,
)
from ._resolver import Resolver
from ._utils.async_utils import (
    TaskContext,
    aclosing,
    async_map,
    async_map_ordered,
    asyncnullcontext,
    retry,
    synchronize_api,
)
from ._utils.blob_utils import (
    BLOCK_SIZE,
    FileUploadSpec,
    FileUploadSpec2,
    blob_upload_file,
    get_file_upload_spec_from_fileobj,
    get_file_upload_spec_from_path,
)
from ._utils.deprecation import deprecation_warning, warn_if_passing_namespace
from ._utils.grpc_utils import Retry
from ._utils.http_utils import ClientSessionRegistry
from ._utils.name_utils import check_object_name
from ._utils.time_utils import as_timestamp, timestamp_to_localized_dt
from .client import _Client
from .config import logger

# Max duration for uploading to volumes files
# As a guide, files >40GiB will take >10 minutes to upload.
VOLUME_PUT_FILE_CLIENT_TIMEOUT = 60 * 60


class FileEntryType(enum.IntEnum):
    """Type of a file entry listed from a Modal volume."""

    UNSPECIFIED = 0
    FILE = 1
    DIRECTORY = 2
    SYMLINK = 3
    FIFO = 4
    SOCKET = 5


@dataclass(frozen=True)
class FileEntry:
    """A file or directory entry listed from a Modal volume."""

    path: str
    type: FileEntryType
    mtime: int
    size: int

    @classmethod
    def _from_proto(cls, proto: api_pb2.FileEntry) -> "FileEntry":
        return cls(
            path=proto.path,
            type=FileEntryType(proto.type),
            mtime=proto.mtime,
            size=proto.size,
        )


@dataclass
class VolumeInfo:
    """Information about the Volume object."""

    # This dataclass should be limited to information that is unchanging over the lifetime of the Volume,
    # since it is transmitted from the server when the object is hydrated and could be stale when accessed.

    name: Optional[str]
    created_at: datetime
    created_by: Optional[str]


class _VolumeManager:
    """Namespace with methods for managing named Volume objects."""

    @staticmethod
    async def create(
        name: str,  # Name to use for the new Volume
        *,
        version: Optional[int] = None,  # Experimental: Configure the backend VolumeFS version
        allow_existing: bool = False,  # If True, no-op when the Volume already exists
        environment_name: Optional[str] = None,  # Uses active environment if not specified
        client: Optional[_Client] = None,  # Optional client with Modal credentials
    ) -> None:
        """Create a new Volume object.

        **Examples:**

        ```python notest
        modal.Volume.objects.create("my-volume")
        ```

        Volumes will be created in the active environment, or another one can be specified:

        ```python notest
        modal.Volume.objects.create("my-volume", environment_name="dev")
        ```

        By default, an error will be raised if the Volume already exists, but passing
        `allow_existing=True` will make the creation attempt a no-op in this case.

        ```python notest
        modal.Volume.objects.create("my-volume", allow_existing=True)
        ```

        Note that this method does not return a local instance of the Volume. You can use
        `modal.Volume.from_name` to perform a lookup after creation.

        Added in v1.1.2.

        """
        check_object_name(name, "Volume")
        client = await _Client.from_env() if client is None else client
        object_creation_type = (
            api_pb2.OBJECT_CREATION_TYPE_CREATE_IF_MISSING
            if allow_existing
            else api_pb2.OBJECT_CREATION_TYPE_CREATE_FAIL_IF_EXISTS
        )

        if version is not None and version not in {1, 2}:
            raise InvalidError("VolumeFS version must be either 1 or 2")

        req = api_pb2.VolumeGetOrCreateRequest(
            deployment_name=name,
            environment_name=_get_environment_name(environment_name),
            object_creation_type=object_creation_type,
            version=version,
        )
        try:
            await client.stub.VolumeGetOrCreate(req)
        except AlreadyExistsError:
            if not allow_existing:
                raise

    @staticmethod
    async def list(
        *,
        max_objects: Optional[int] = None,  # Limit requests to this size
        created_before: Optional[Union[datetime, str]] = None,  # Limit based on creation date
        environment_name: str = "",  # Uses active environment if not specified
        client: Optional[_Client] = None,  # Optional client with Modal credentials
    ) -> builtins.list["_Volume"]:
        """Return a list of hydrated Volume objects.

        **Examples:**

        ```python
        volumes = modal.Volume.objects.list()
        print([v.name for v in volumes])
        ```

        Volumes will be retreived from the active environment, or another one can be specified:

        ```python notest
        dev_volumes = modal.Volume.objects.list(environment_name="dev")
        ```

        By default, all named Volumes are returned, newest to oldest. It's also possible to limit the
        number of results and to filter by creation date:

        ```python
        volumes = modal.Volume.objects.list(max_objects=10, created_before="2025-01-01")
        ```

        Added in v1.1.2.

        """
        client = await _Client.from_env() if client is None else client
        if max_objects is not None and max_objects < 0:
            raise InvalidError("max_objects cannot be negative")

        items: list[api_pb2.VolumeListItem] = []

        async def retrieve_page(created_before: float) -> bool:
            max_page_size = 100 if max_objects is None else min(100, max_objects - len(items))
            pagination = api_pb2.ListPagination(max_objects=max_page_size, created_before=created_before)
            req = api_pb2.VolumeListRequest(
                environment_name=_get_environment_name(environment_name), pagination=pagination
            )
            resp = await client.stub.VolumeList(req)
            items.extend(resp.items)
            finished = (len(resp.items) < max_page_size) or (max_objects is not None and len(items) >= max_objects)
            return finished

        finished = await retrieve_page(as_timestamp(created_before))
        while True:
            if finished:
                break
            finished = await retrieve_page(items[-1].metadata.creation_info.created_at)

        volumes = [
            _Volume._new_hydrated(
                item.volume_id,
                client,
                item.metadata,
                is_another_app=True,
                rep=_Volume._repr(item.label, environment_name),
            )
            for item in items
        ]
        return volumes[:max_objects] if max_objects is not None else volumes

    @staticmethod
    async def delete(
        name: str,  # Name of the Volume to delete
        *,
        allow_missing: bool = False,  # If True, don't raise an error if the Volume doesn't exist
        environment_name: Optional[str] = None,  # Uses active environment if not specified
        client: Optional[_Client] = None,  # Optional client with Modal credentials
    ):
        """Delete a named Volume.

        Warning: This deletes an *entire Volume*, not just a specific file.
        Deletion is irreversible and will affect any Apps currently using the Volume.

        **Examples:**

        ```python notest
        await modal.Volume.objects.delete("my-volume")
        ```

        Volumes will be deleted from the active environment, or another one can be specified:

        ```python notest
        await modal.Volume.objects.delete("my-volume", environment_name="dev")
        ```

        Added in v1.1.2.

        """
        try:
            obj = await _Volume.from_name(name, environment_name=environment_name).hydrate(client)
        except NotFoundError:
            if not allow_missing:
                raise
        else:
            req = api_pb2.VolumeDeleteRequest(volume_id=obj.object_id)
            await obj._client.stub.VolumeDelete(req)


VolumeManager = synchronize_api(_VolumeManager)


class _Volume(_Object, type_prefix="vo"):
    """A writeable volume that can be used to share files between one or more Modal functions.

    The contents of a volume is exposed as a filesystem. You can use it to share data between different functions, or
    to persist durable state across several instances of the same function.

    Unlike a networked filesystem, you need to explicitly reload the volume to see changes made since it was mounted.
    Similarly, you need to explicitly commit any changes you make to the volume for the changes to become visible
    outside the current container.

    Concurrent modification is supported, but concurrent modifications of the same files should be avoided! Last write
    wins in case of concurrent modification of the same file - any data the last writer didn't have when committing
    changes will be lost!

    As a result, volumes are typically not a good fit for use cases where you need to make concurrent modifications to
    the same file (nor is distributed file locking supported).

    Volumes can only be reloaded if there are no open files for the volume - attempting to reload with open files
    will result in an error.

    **Usage**

    ```python
    import modal

    app = modal.App()
    volume = modal.Volume.from_name("my-persisted-volume", create_if_missing=True)

    @app.function(volumes={"/root/foo": volume})
    def f():
        with open("/root/foo/bar.txt", "w") as f:
            f.write("hello")
        volume.commit()  # Persist changes

    @app.function(volumes={"/root/foo": volume})
    def g():
        volume.reload()  # Fetch latest changes
        with open("/root/foo/bar.txt", "r") as f:
            print(f.read())
    ```
    """

    _lock: Optional[asyncio.Lock] = None
    _metadata: "typing.Optional[api_pb2.VolumeMetadata]"
    _read_only: bool = False

    @classproperty
    def objects(cls) -> _VolumeManager:
        return _VolumeManager

    @property
    def name(self) -> Optional[str]:
        return self._name

    def read_only(self) -> "_Volume":
        """Configure Volume to mount as read-only.

        **Example**

        ```python
        import modal

        volume = modal.Volume.from_name("my-volume", create_if_missing=True)

        @app.function(volumes={"/mnt/items": volume.read_only()})
        def f():
            with open("/mnt/items/my-file.txt") as f:
                return f.read()
        ```

        The Volume is mounted as a read-only volume in a function. Any file system write operation into the
        mounted volume will result in an error.

        Added in v1.0.5.
        """

        async def _load(
            new_volume: _Volume, resolver: Resolver, load_context: LoadContext, existing_object_id: Optional[str]
        ):
            new_volume._initialize_from_other(self)
            new_volume._read_only = True

        obj = _Volume._from_loader(
            _load,
            "Volume()",
            hydrate_lazily=True,
            deps=lambda: [self],
            load_context_overrides=self._load_context_overrides,
        )
        return obj

    def _hydrate_metadata(self, metadata: Optional[Message]):
        if metadata:
            assert isinstance(metadata, api_pb2.VolumeMetadata)
            self._metadata = metadata
            self._name = metadata.name

    def _get_metadata(self) -> Optional[Message]:
        return self._metadata

    async def _get_lock(self):
        # To (mostly*) prevent multiple concurrent operations on the same volume, which can cause problems under
        # some unlikely circumstances.
        # *: You can bypass this by creating multiple handles to the same volume, e.g. via lookup. But this
        # covers the typical case = good enough.

        # Note: this function runs no async code but is marked as async to ensure it's
        # being run inside the synchronicity event loop and binds the lock to the
        # correct event loop on Python 3.9 which eagerly assigns event loops on
        # constructions of locks
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    @property
    def _is_v1(self) -> bool:
        return self._metadata.version in [
            None,
            api_pb2.VolumeFsVersion.VOLUME_FS_VERSION_UNSPECIFIED,
            api_pb2.VolumeFsVersion.VOLUME_FS_VERSION_V1,
        ]

    @staticmethod
    def from_name(
        name: str,
        *,
        namespace=None,  # mdmd:line-hidden
        environment_name: Optional[str] = None,
        create_if_missing: bool = False,
        version: "typing.Optional[modal_proto.api_pb2.VolumeFsVersion.ValueType]" = None,
        client: Optional[_Client] = None,
    ) -> "_Volume":
        """Reference a Volume by name, creating if necessary.

        This is a lazy method that defers hydrating the local
        object with metadata from Modal servers until the first
        time is is actually used.

        ```python
        vol = modal.Volume.from_name("my-volume", create_if_missing=True)

        app = modal.App()

        # Volume refers to the same object, even across instances of `app`.
        @app.function(volumes={"/data": vol})
        def f():
            pass
        ```
        """
        check_object_name(name, "Volume")
        warn_if_passing_namespace(namespace, "modal.Volume.from_name")

        async def _load(
            self: _Volume, resolver: Resolver, load_context: LoadContext, existing_object_id: Optional[str]
        ):
            req = api_pb2.VolumeGetOrCreateRequest(
                deployment_name=name,
                environment_name=load_context.environment_name,
                object_creation_type=(api_pb2.OBJECT_CREATION_TYPE_CREATE_IF_MISSING if create_if_missing else None),
                version=version,
            )
            response = await load_context.client.stub.VolumeGetOrCreate(req)
            self._hydrate(response.volume_id, load_context.client, response.metadata)

        rep = _Volume._repr(name, environment_name)
        return _Volume._from_loader(
            _load,
            rep,
            hydrate_lazily=True,
            name=name,
            load_context_overrides=LoadContext(client=client, environment_name=environment_name),
        )

    @classmethod
    @asynccontextmanager
    async def ephemeral(
        cls: type["_Volume"],
        client: Optional[_Client] = None,
        environment_name: Optional[str] = None,
        version: "typing.Optional[modal_proto.api_pb2.VolumeFsVersion.ValueType]" = None,
        _heartbeat_sleep: float = EPHEMERAL_OBJECT_HEARTBEAT_SLEEP,  # mdmd:line-hidden
    ) -> AsyncGenerator["_Volume", None]:
        """Creates a new ephemeral volume within a context manager:

        Usage:
        ```python
        import modal
        with modal.Volume.ephemeral() as vol:
            assert vol.listdir("/") == []
        ```

        ```python notest
        async with modal.Volume.ephemeral() as vol:
            assert await vol.listdir("/") == []
        ```
        """
        if client is None:
            client = await _Client.from_env()
        request = api_pb2.VolumeGetOrCreateRequest(
            object_creation_type=api_pb2.OBJECT_CREATION_TYPE_EPHEMERAL,
            environment_name=_get_environment_name(environment_name),
            version=version,
        )
        response = await client.stub.VolumeGetOrCreate(request)
        async with TaskContext() as tc:
            request = api_pb2.VolumeHeartbeatRequest(volume_id=response.volume_id)
            tc.infinite_loop(lambda: client.stub.VolumeHeartbeat(request), sleep=_heartbeat_sleep)
            yield cls._new_hydrated(
                response.volume_id,
                client,
                response.metadata,
                is_another_app=True,
                rep="modal.Volume.ephemeral()",
            )

    @staticmethod
    async def create_deployed(
        deployment_name: str,
        namespace=None,  # mdmd:line-hidden
        client: Optional[_Client] = None,
        environment_name: Optional[str] = None,
        version: "typing.Optional[modal_proto.api_pb2.VolumeFsVersion.ValueType]" = None,
    ) -> str:
        """mdmd:hidden"""
        deprecation_warning(
            (2025, 8, 13),
            "The undocumented `modal.Volume.create_deployed` method is deprecated and will be removed "
            "in a future release. It can be replaced with `modal.Volume.objects.create`.",
        )
        return await _Volume._create_deployed(deployment_name, namespace, client, environment_name, version)

    @staticmethod
    async def _create_deployed(
        deployment_name: str,
        namespace=None,  # mdmd:line-hidden
        client: Optional[_Client] = None,
        environment_name: Optional[str] = None,
        version: "typing.Optional[modal_proto.api_pb2.VolumeFsVersion.ValueType]" = None,
    ) -> str:
        """mdmd:hidden"""
        check_object_name(deployment_name, "Volume")
        warn_if_passing_namespace(namespace, "modal.Volume.create_deployed")
        if client is None:
            client = await _Client.from_env()
        request = api_pb2.VolumeGetOrCreateRequest(
            deployment_name=deployment_name,
            environment_name=_get_environment_name(environment_name),
            object_creation_type=api_pb2.OBJECT_CREATION_TYPE_CREATE_FAIL_IF_EXISTS,
            version=version,
        )
        resp = await client.stub.VolumeGetOrCreate(request)
        return resp.volume_id

    @live_method
    async def info(self) -> VolumeInfo:
        """Return information about the Volume object."""
        metadata = self._get_metadata()
        if not metadata:
            return VolumeInfo()
        creation_info = metadata.creation_info
        return VolumeInfo(
            name=metadata.name or None,
            created_at=timestamp_to_localized_dt(creation_info.created_at),
            created_by=creation_info.created_by or None,
        )

    @live_method
    async def _do_reload(self, lock=True):
        async with (await self._get_lock()) if lock else asyncnullcontext():
            req = api_pb2.VolumeReloadRequest(volume_id=self.object_id)
            _ = await self._client.stub.VolumeReload(req)

    @live_method
    async def commit(self):
        """Commit changes to a mounted volume.

        If successful, the changes made are now persisted in durable storage and available to other containers accessing
        the volume.
        """
        async with await self._get_lock():
            req = api_pb2.VolumeCommitRequest(volume_id=self.object_id)
            try:
                # TODO(gongy): only apply indefinite retries on 504 status.
                resp = await self._client.stub.VolumeCommit(req, retry=Retry(max_retries=90))
                if not resp.skip_reload:
                    # Reload changes on successful commit.
                    await self._do_reload(lock=False)
            except (ConflictError, NotFoundError) as exc:
                raise RuntimeError(str(exc))

    @live_method
    async def reload(self):
        """Make latest committed state of volume available in the running container.

        Any uncommitted changes to the volume, such as new or modified files, may implicitly be committed when
        reloading.

        Reloading will fail if there are open files for the volume.
        """
        try:
            await self._do_reload()
        except (NotFoundError, ConflictError) as exc:
            # TODO(staffan): This is brittle and janky, as it relies on specific paths and error messages which can
            #  change server-side at any time. Consider returning the open files directly in the error emitted from the
            #  server.
            message = str(exc)
            if "there are open files preventing the operation" in message:
                # Attempt to identify what open files are problematic and include information about the first (to avoid
                # really verbose errors) open file in the error message to help troubleshooting.
                # This is best-effort and not necessarily bulletproof, as the view of open files inside the container
                # might differ from that outside - but it will at least catch common errors.
                vol_path = f"/__modal/volumes/{self.object_id}"
                annotation = _open_files_error_annotation(vol_path)
                if annotation:
                    raise RuntimeError(f"{message}: {annotation}")
            raise RuntimeError(message)

    @live_method_gen
    async def iterdir(self, path: str, *, recursive: bool = True) -> AsyncIterator[FileEntry]:
        """Iterate over all files in a directory in the volume.

        Passing a directory path lists all files in the directory. For a file path, return only that
        file's description. If `recursive` is set to True, list all files and folders under the path
        recursively.
        """
        if path.endswith("**"):
            raise InvalidError(
                "Glob patterns in `volume get` and `Volume.listdir()` are deprecated. "
                "Please pass recursive=True instead. For the CLI, just remove the glob suffix."
            )
        elif path.endswith("*"):
            raise InvalidError(
                "Glob patterns in `volume get` and `Volume.listdir()` are deprecated. "
                "Please remove the glob `*` suffix."
            )

        if self._is_v1:
            req = api_pb2.VolumeListFilesRequest(volume_id=self.object_id, path=path, recursive=recursive)
            async for batch in self._client.stub.VolumeListFiles.unary_stream(req):
                for entry in batch.entries:
                    yield FileEntry._from_proto(entry)
        else:
            req = api_pb2.VolumeListFiles2Request(volume_id=self.object_id, path=path, recursive=recursive)
            async for batch in self._client.stub.VolumeListFiles2.unary_stream(req):
                for entry in batch.entries:
                    yield FileEntry._from_proto(entry)

    @live_method
    async def listdir(self, path: str, *, recursive: bool = False) -> list[FileEntry]:
        """List all files under a path prefix in the modal.Volume.

        Passing a directory path lists all files in the directory. For a file path, return only that
        file's description. If `recursive` is set to True, list all files and folders under the path
        recursively.
        """
        return [entry async for entry in self.iterdir(path, recursive=recursive)]

    @live_method_gen
    async def read_file(self, path: str) -> AsyncGenerator[bytes, None]:
        """
        Read a file from the modal.Volume.

        Note - this function is primarily intended to be used outside of a Modal App.
        For more information on downloading files from a Modal Volume, see
        [the guide](https://modal.com/docs/guide/volumes).

        **Example:**

        ```python notest
        vol = modal.Volume.from_name("my-modal-volume")
        data = b""
        for chunk in vol.read_file("1mb.csv"):
            data += chunk
        print(len(data))  # == 1024 * 1024
        ```
        """
        req = api_pb2.VolumeGetFile2Request(volume_id=self.object_id, path=path)

        try:
            response = await self._client.stub.VolumeGetFile2(req)
        except modal.exception.NotFoundError as exc:
            raise FileNotFoundError(exc.args[0])

        @retry(n_attempts=5, base_delay=0.1, timeout=None)
        async def read_block(block_url: str) -> bytes:
            async with ClientSessionRegistry.get_session().get(block_url) as get_response:
                get_response.raise_for_status()
                return await get_response.content.read()

        async def iter_urls() -> AsyncGenerator[str]:
            for url in response.get_urls:
                yield url

        # TODO(dflemstr): Reasonable default? Make configurable?
        prefetch_num_blocks = multiprocessing.cpu_count()

        async with aclosing(async_map_ordered(iter_urls(), read_block, concurrency=prefetch_num_blocks)) as stream:
            async for value in stream:
                yield value

    @live_method
    async def read_file_into_fileobj(
        self,
        path: str,
        fileobj: typing.IO[bytes],
        progress_cb: Optional[Callable[..., Any]] = None,
    ) -> int:
        """mdmd:hidden
        Read volume file into file-like IO object.
        """
        return await self._read_file_into_fileobj(path, fileobj, progress_cb=progress_cb)

    @live_method
    async def _read_file_into_fileobj(
        self,
        path: str,
        fileobj: typing.IO[bytes],
        concurrency: Optional[int] = None,
        download_semaphore: Optional[asyncio.Semaphore] = None,
        progress_cb: Optional[Callable[..., Any]] = None,
    ) -> int:
        if progress_cb is None:

            def progress_cb(*_, **__):
                pass

        if concurrency is None:
            concurrency = multiprocessing.cpu_count()

        req = api_pb2.VolumeGetFile2Request(volume_id=self.object_id, path=path)

        try:
            response = await self._client.stub.VolumeGetFile2(req)
        except modal.exception.NotFoundError as exc:
            raise FileNotFoundError(exc.args[0])

        if download_semaphore is None:
            download_semaphore = asyncio.Semaphore(concurrency)

        write_lock = asyncio.Lock()
        start_pos = fileobj.tell()

        @retry(n_attempts=5, base_delay=0.1, timeout=None)
        async def download_block(idx, url) -> int:
            block_start_pos = start_pos + idx * BLOCK_SIZE
            num_bytes_written = 0

            async with download_semaphore, ClientSessionRegistry.get_session().get(url) as get_response:
                get_response.raise_for_status()
                async for chunk in get_response.content.iter_any():
                    num_chunk_bytes_written = 0

                    while num_chunk_bytes_written < len(chunk):
                        async with write_lock:
                            fileobj.seek(block_start_pos + num_bytes_written + num_chunk_bytes_written)
                            # TODO(dflemstr): this is a small write, but nonetheless might block the event loop for some
                            #  time:
                            n = fileobj.write(chunk)

                        num_chunk_bytes_written += n
                        progress_cb(advance=n)

                    num_bytes_written += len(chunk)

            return num_bytes_written

        coros = [download_block(idx, url) for idx, url in enumerate(response.get_urls)]

        total_size = sum(await asyncio.gather(*coros))
        fileobj.seek(start_pos + total_size)

        return total_size

    @live_method
    async def remove_file(self, path: str, recursive: bool = False) -> None:
        """Remove a file or directory from a volume."""
        if self._read_only:
            raise InvalidError("Read-only Volume can not be written to")

        try:
            if self._is_v1:
                req = api_pb2.VolumeRemoveFileRequest(volume_id=self.object_id, path=path, recursive=recursive)
                await self._client.stub.VolumeRemoveFile(req)
            else:
                req = api_pb2.VolumeRemoveFile2Request(volume_id=self.object_id, path=path, recursive=recursive)
                await self._client.stub.VolumeRemoveFile2(req)
        except modal.exception.NotFoundError as exc:
            raise FileNotFoundError(exc.args[0])

    @live_method
    async def copy_files(self, src_paths: Sequence[str], dst_path: str, recursive: bool = False) -> None:
        """
        Copy files within the volume from src_paths to dst_path.
        The semantics of the copy operation follow those of the UNIX cp command.

        The `src_paths` parameter is a list. If you want to copy a single file, you should pass a list with a
        single element.

        `src_paths` and `dst_path` should refer to the desired location *inside* the volume. You do not need to prepend
        the volume mount path.

        **Usage**

        ```python notest
        vol = modal.Volume.from_name("my-modal-volume")

        vol.copy_files(["bar/example.txt"], "bar2")  # Copy files to another directory
        vol.copy_files(["bar/example.txt"], "bar/example2.txt")  # Rename a file by copying
        ```

        Note that if the volume is already mounted on the Modal function, you should use normal filesystem operations
        like `os.rename()` and then `commit()` the volume. The `copy_files()` method is useful when you don't have
        the volume mounted as a filesystem, e.g. when running a script on your local computer.
        """
        if self._read_only:
            raise InvalidError("Read-only Volume can not be written to")

        if self._is_v1:
            if recursive:
                raise ValueError("`recursive` is not supported for V1 volumes")

            request = api_pb2.VolumeCopyFilesRequest(
                volume_id=self.object_id, src_paths=src_paths, dst_path=dst_path, recursive=recursive
            )
            await self._client.stub.VolumeCopyFiles(request, retry=Retry(base_delay=1))
        else:
            request = api_pb2.VolumeCopyFiles2Request(
                volume_id=self.object_id, src_paths=src_paths, dst_path=dst_path, recursive=recursive
            )
            await self._client.stub.VolumeCopyFiles2(request, retry=Retry(base_delay=1))

    @live_method_contextmanager
    @asynccontextmanager
    async def batch_upload(self, force: bool = False) -> AsyncGenerator["_AbstractVolumeUploadContextManager", None]:
        """
        Initiate a batched upload to a volume.

        To allow overwriting existing files, set `force` to `True` (you cannot overwrite existing directories with
        uploaded files regardless).

        **Example:**

        ```python notest
        vol = modal.Volume.from_name("my-modal-volume")

        with vol.batch_upload() as batch:
            batch.put_file("local-path.txt", "/remote-path.txt")
            batch.put_directory("/local/directory/", "/remote/directory")
            batch.put_file(io.BytesIO(b"some data"), "/foobar")
        ```
        """
        if self._read_only:
            raise InvalidError("Read-only Volume can not be written to")

        version_context_manager = _AbstractVolumeUploadContextManager.resolve(
            self._metadata.version, self.object_id, self._client, force=force
        )
        await version_context_manager.__aenter__()
        try:
            yield version_context_manager
        finally:
            exc_type, exc_value, traceback = sys.exc_info()
            await version_context_manager.__aexit__(exc_type, exc_value, traceback)

    @live_method
    async def _instance_delete(self):
        await self._client.stub.VolumeDelete(api_pb2.VolumeDeleteRequest(volume_id=self.object_id))

    @staticmethod
    async def delete(name: str, client: Optional[_Client] = None, environment_name: Optional[str] = None):
        """mdmd:hidden
        Delete a named Volume.

        Warning: This deletes an *entire Volume*, not just a specific file.
        Deletion is irreversible and will affect any Apps currently using the Volume.

        DEPRECATED: This method is deprecated; we recommend using `modal.Volume.objects.delete` instead.

        """
        deprecation_warning(
            (2025, 8, 6),
            "`modal.Volume.delete` is deprecated; we recommend using `modal.Volume.objects.delete` instead.",
        )
        await _Volume.objects.delete(name, environment_name=environment_name, client=client)

    @staticmethod
    async def rename(
        old_name: str,
        new_name: str,
        *,
        client: Optional[_Client] = None,
        environment_name: Optional[str] = None,
    ):
        obj = await _Volume.from_name(old_name, environment_name=environment_name).hydrate(client)
        req = api_pb2.VolumeRenameRequest(volume_id=obj.object_id, name=new_name)
        await obj._client.stub.VolumeRename(req)


Volume = synchronize_api(_Volume)


# TODO(dflemstr): Find a way to add ABC or AbstractAsyncContextManager superclasses while keeping synchronicity happy.
class _AbstractVolumeUploadContextManager:
    async def __aenter__(self): ...

    async def __aexit__(self, exc_type, exc_val, exc_tb): ...

    def put_file(
        self,
        local_file: Union[Path, str, BinaryIO, BytesIO],
        remote_path: Union[PurePosixPath, str],
        mode: Optional[int] = None,
    ): ...

    def put_directory(
        self,
        local_path: Union[Path, str],
        remote_path: Union[PurePosixPath, str],
        recursive: bool = True,
    ): ...

    @staticmethod
    def resolve(
        version: "modal_proto.api_pb2.VolumeFsVersion.ValueType",
        object_id: str,
        client,
        progress_cb: Optional[Callable[..., Any]] = None,
        force: bool = False,
    ) -> "_AbstractVolumeUploadContextManager":
        if version in [
            None,
            api_pb2.VolumeFsVersion.VOLUME_FS_VERSION_UNSPECIFIED,
            api_pb2.VolumeFsVersion.VOLUME_FS_VERSION_V1,
        ]:
            return _VolumeUploadContextManager(object_id, client, progress_cb=progress_cb, force=force)
        elif version == api_pb2.VolumeFsVersion.VOLUME_FS_VERSION_V2:
            return _VolumeUploadContextManager2(object_id, client, progress_cb=progress_cb, force=force)
        else:
            raise RuntimeError(f"unsupported volume version: {version}")


AbstractVolumeUploadContextManager = synchronize_api(_AbstractVolumeUploadContextManager)


class _VolumeUploadContextManager(_AbstractVolumeUploadContextManager):
    """Context manager for batch-uploading files to a Volume."""

    _volume_id: str
    _client: _Client
    _force: bool
    progress_cb: Callable[..., Any]
    _upload_generators: list[Generator[Callable[[], FileUploadSpec], None, None]]

    def __init__(
        self, volume_id: str, client: _Client, progress_cb: Optional[Callable[..., Any]] = None, force: bool = False
    ):
        """mdmd:hidden"""
        self._volume_id = volume_id
        self._client = client
        self._upload_generators = []
        self._progress_cb = progress_cb or (lambda *_, **__: None)
        self._force = force

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if not exc_val:
            # Flatten all the uploads yielded by the upload generators in the batch
            def gen_upload_providers():
                for gen in self._upload_generators:
                    yield from gen

            async def gen_file_upload_specs() -> AsyncGenerator[FileUploadSpec, None]:
                loop = asyncio.get_event_loop()
                with concurrent.futures.ThreadPoolExecutor() as exe:
                    # TODO: avoid eagerly expanding
                    futs = [loop.run_in_executor(exe, f) for f in gen_upload_providers()]
                    logger.debug(f"Computing checksums for {len(futs)} files using {exe._max_workers} workers")
                    for fut in asyncio.as_completed(futs):
                        yield await fut

            # Compute checksums & Upload files
            files: list[api_pb2.MountFile] = []
            async with aclosing(async_map(gen_file_upload_specs(), self._upload_file, concurrency=20)) as stream:
                async for item in stream:
                    files.append(item)

            self._progress_cb(complete=True)

            request = api_pb2.VolumePutFilesRequest(
                volume_id=self._volume_id,
                files=files,
                disallow_overwrite_existing_files=not self._force,
            )
            try:
                await self._client.stub.VolumePutFiles(request, retry=Retry(base_delay=1))
            except AlreadyExistsError as exc:
                raise FileExistsError(str(exc))

    def put_file(
        self,
        local_file: Union[Path, str, BinaryIO, BytesIO],
        remote_path: Union[PurePosixPath, str],
        mode: Optional[int] = None,
    ):
        """Upload a file from a local file or file-like object.

        Will create any needed parent directories automatically.

        If `local_file` is a file-like object it must remain readable for the lifetime of the batch.
        """
        remote_path = PurePosixPath(remote_path).as_posix()
        if remote_path.endswith("/"):
            raise ValueError(f"remote_path ({remote_path}) must refer to a file - cannot end with /")

        def gen():
            if isinstance(local_file, str) or isinstance(local_file, Path):
                yield lambda: get_file_upload_spec_from_path(local_file, PurePosixPath(remote_path), mode)
            else:
                yield lambda: get_file_upload_spec_from_fileobj(local_file, PurePosixPath(remote_path), mode or 0o644)

        self._upload_generators.append(gen())

    def put_directory(
        self,
        local_path: Union[Path, str],
        remote_path: Union[PurePosixPath, str],
        recursive: bool = True,
    ):
        """
        Upload all files in a local directory.

        Will create any needed parent directories automatically.
        """
        local_path = Path(local_path)
        assert local_path.is_dir()
        remote_path = PurePosixPath(remote_path)

        def create_file_spec_provider(subpath):
            relpath_str = subpath.relative_to(local_path)
            return lambda: get_file_upload_spec_from_path(subpath, remote_path / relpath_str)

        def gen():
            glob = local_path.rglob("*") if recursive else local_path.glob("*")
            for subpath in glob:
                # Skip directories and unsupported file types (e.g. block devices)
                if subpath.is_file():
                    yield create_file_spec_provider(subpath)

        self._upload_generators.append(gen())

    async def _upload_file(self, file_spec: FileUploadSpec) -> api_pb2.MountFile:
        remote_filename = file_spec.mount_filename
        progress_task_id = self._progress_cb(name=remote_filename, size=file_spec.size)
        request = api_pb2.MountPutFileRequest(sha256_hex=file_spec.sha256_hex)
        response = await self._client.stub.MountPutFile(request, retry=Retry(base_delay=1))

        start_time = time.monotonic()
        if not response.exists:
            if file_spec.use_blob:
                logger.debug(f"Creating blob file for {file_spec.source_description} ({file_spec.size} bytes)")
                with file_spec.source() as fp:
                    blob_id = await blob_upload_file(
                        fp,
                        self._client.stub,
                        functools.partial(self._progress_cb, progress_task_id),
                        sha256_hex=file_spec.sha256_hex,
                        md5_hex=file_spec.md5_hex,
                    )
                logger.debug(f"Uploading blob file {file_spec.source_description} as {remote_filename}")
                request2 = api_pb2.MountPutFileRequest(data_blob_id=blob_id, sha256_hex=file_spec.sha256_hex)
            else:
                logger.debug(
                    f"Uploading file {file_spec.source_description} to {remote_filename} ({file_spec.size} bytes)"
                )
                if file_spec.content is None:
                    content = await asyncio.to_thread(file_spec.read_content)
                else:
                    content = file_spec.content
                request2 = api_pb2.MountPutFileRequest(data=content, sha256_hex=file_spec.sha256_hex)
                self._progress_cb(task_id=progress_task_id, complete=True)

            while (time.monotonic() - start_time) < VOLUME_PUT_FILE_CLIENT_TIMEOUT:
                response = await self._client.stub.MountPutFile(request2, retry=Retry(base_delay=1))
                if response.exists:
                    break

            if not response.exists:
                raise VolumeUploadTimeoutError(f"Uploading of {file_spec.source_description} timed out")
        else:
            self._progress_cb(task_id=progress_task_id, complete=True)
        return api_pb2.MountFile(
            filename=remote_filename,
            sha256_hex=file_spec.sha256_hex,
            mode=file_spec.mode,
        )


VolumeUploadContextManager = synchronize_api(_VolumeUploadContextManager)

_FileUploader2 = Callable[[asyncio.Semaphore], Awaitable[FileUploadSpec2]]


class _VolumeUploadContextManager2(_AbstractVolumeUploadContextManager):
    """Context manager for batch-uploading files to a Volume version 2."""

    _volume_id: str
    _client: _Client
    _progress_cb: Callable[..., Any]
    _force: bool
    _hash_concurrency: int
    _put_concurrency: int
    _uploader_generators: list[Generator[_FileUploader2]]

    def __init__(
        self,
        volume_id: str,
        client: _Client,
        progress_cb: Optional[Callable[..., Any]] = None,
        force: bool = False,
        hash_concurrency: int = multiprocessing.cpu_count(),
        put_concurrency: int = 128,
    ):
        """mdmd:hidden"""
        self._volume_id = volume_id
        self._client = client
        self._uploader_generators = []
        self._progress_cb = progress_cb or (lambda *_, **__: None)
        self._force = force
        self._hash_concurrency = hash_concurrency
        self._put_concurrency = put_concurrency

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if not exc_val:
            # Flatten all the uploads yielded by the upload generators in the batch
            def gen_upload_providers():
                for gen in self._uploader_generators:
                    yield from gen

            async def gen_file_upload_specs() -> list[FileUploadSpec2]:
                hash_semaphore = asyncio.Semaphore(self._hash_concurrency)

                uploads = [asyncio.create_task(fut(hash_semaphore)) for fut in gen_upload_providers()]
                logger.debug(f"Computing checksums for {len(uploads)} files")

                file_specs = []
                for file_spec in asyncio.as_completed(uploads):
                    file_specs.append(await file_spec)
                return file_specs

            upload_specs = await gen_file_upload_specs()
            await self._put_file_specs(upload_specs)

    def put_file(
        self,
        local_file: Union[Path, str, BinaryIO, BytesIO],
        remote_path: Union[PurePosixPath, str],
        mode: Optional[int] = None,
    ):
        """Upload a file from a local file or file-like object.

        Will create any needed parent directories automatically.

        If `local_file` is a file-like object it must remain readable for the lifetime of the batch.
        """
        remote_path = PurePosixPath(remote_path).as_posix()
        if remote_path.endswith("/"):
            raise ValueError(f"remote_path ({remote_path}) must refer to a file - cannot end with /")

        def gen():
            if isinstance(local_file, str) or isinstance(local_file, Path):
                yield lambda hash_semaphore: FileUploadSpec2.from_path(
                    local_file, PurePosixPath(remote_path), hash_semaphore, mode
                )
            else:
                yield lambda hash_semaphore: FileUploadSpec2.from_fileobj(
                    local_file, PurePosixPath(remote_path), hash_semaphore, mode or 0o644
                )

        self._uploader_generators.append(gen())

    def put_directory(
        self,
        local_path: Union[Path, str],
        remote_path: Union[PurePosixPath, str],
        recursive: bool = True,
    ):
        """
        Upload all files in a local directory.

        Will create any needed parent directories automatically.
        """
        local_path = Path(local_path)
        assert local_path.is_dir()
        remote_path = PurePosixPath(remote_path)

        def create_spec(subpath):
            relpath_str = subpath.relative_to(local_path)
            return lambda hash_semaphore: FileUploadSpec2.from_path(subpath, remote_path / relpath_str, hash_semaphore)

        def gen():
            glob = local_path.rglob("*") if recursive else local_path.glob("*")
            for subpath in glob:
                # Skip directories and unsupported file types (e.g. block devices)
                if subpath.is_file():
                    yield create_spec(subpath)

        self._uploader_generators.append(gen())

    async def _put_file_specs(self, file_specs: list[FileUploadSpec2]):
        put_responses = {}
        # num_blocks_total = sum(len(file_spec.blocks_sha256) for file_spec in file_specs)

        logger.debug(f"Ensuring {len(file_specs)} files are uploaded...")

        # We should only need two iterations: Once to possibly get some missing_blocks; the second time we should have
        # all blocks uploaded
        for _ in range(2):
            files = []

            for file_spec in file_specs:
                blocks = [
                    api_pb2.VolumePutFiles2Request.Block(
                        contents_sha256=block.contents_sha256, put_response=put_responses.get(block.contents_sha256)
                    )
                    for block in file_spec.blocks
                ]
                files.append(
                    api_pb2.VolumePutFiles2Request.File(
                        path=file_spec.path, mode=file_spec.mode, size=file_spec.size, blocks=blocks
                    )
                )

            request = api_pb2.VolumePutFiles2Request(
                volume_id=self._volume_id,
                files=files,
                disallow_overwrite_existing_files=not self._force,
            )

            try:
                response = await self._client.stub.VolumePutFiles2(request, retry=Retry(base_delay=1))
            except AlreadyExistsError as exc:
                raise FileExistsError(str(exc))

            if not response.missing_blocks:
                break

            await _put_missing_blocks(
                file_specs, response.missing_blocks, put_responses, self._put_concurrency, self._progress_cb
            )
        else:
            raise RuntimeError("Did not succeed at uploading all files despite supplying all missing blocks")

        self._progress_cb(complete=True)


VolumeUploadContextManager2 = synchronize_api(_VolumeUploadContextManager2)


async def _put_missing_blocks(
    file_specs: list[FileUploadSpec2],
    # TODO(dflemstr): Element type is `api_pb2.VolumePutFiles2Response.MissingBlock` but synchronicity gets confused
    # by the nested class (?)
    missing_blocks: list,
    put_responses: dict[bytes, bytes],
    put_concurrency: int,
    progress_cb: Callable[..., Any],
):
    @dataclass
    class FileProgress:
        task_id: str
        pending_blocks: set[int]

    put_semaphore = asyncio.Semaphore(put_concurrency)
    file_progresses: dict[str, FileProgress] = dict()

    logger.debug(f"Uploading {len(missing_blocks)} missing blocks...")

    async def put_missing_block(
        # TODO(dflemstr): Type is `api_pb2.VolumePutFiles2Response.MissingBlock` but synchronicity gets confused
        # by the nested class (?)
        missing_block,
    ) -> tuple[bytes, bytes]:
        # Lazily import to keep the eager loading time of this module down
        from ._utils.bytes_io_segment_payload import BytesIOSegmentPayload

        assert isinstance(missing_block, api_pb2.VolumePutFiles2Response.MissingBlock)

        file_spec = file_specs[missing_block.file_index]
        # TODO(dflemstr): What if the underlying file has changed here in the meantime; should we check the
        #  hash again just to be sure?
        block = file_spec.blocks[missing_block.block_index]

        if file_spec.path not in file_progresses:
            file_task_id = progress_cb(name=file_spec.path, size=file_spec.size)
            file_progresses[file_spec.path] = FileProgress(task_id=file_task_id, pending_blocks=set())

        file_progress = file_progresses[file_spec.path]
        file_progress.pending_blocks.add(missing_block.block_index)
        task_progress_cb = functools.partial(progress_cb, task_id=file_progress.task_id)

        @retry(n_attempts=11, base_delay=0.5, timeout=None)
        async def put_missing_block_attempt(payload: BytesIOSegmentPayload) -> bytes:
            with payload.reset_on_error(subtract_progress=True):
                async with ClientSessionRegistry.get_session().put(
                    missing_block.put_url,
                    data=payload,
                ) as response:
                    response.raise_for_status()
                    return await response.content.read()

        async with put_semaphore:
            with file_spec.source() as source_fp:
                payload = BytesIOSegmentPayload(
                    source_fp,
                    block.start,
                    block.end - block.start,
                    # limit chunk size somewhat to not keep event loop busy for too long
                    chunk_size=256 * 1024,
                    progress_report_cb=task_progress_cb,
                )
                resp_data = await put_missing_block_attempt(payload)

        file_progress.pending_blocks.remove(missing_block.block_index)

        if len(file_progress.pending_blocks) == 0:
            task_progress_cb(complete=True)

        return block.contents_sha256, resp_data

    tasks = [asyncio.create_task(put_missing_block(missing_block)) for missing_block in missing_blocks]
    for task_result in asyncio.as_completed(tasks):
        digest, resp = await task_result
        put_responses[digest] = resp


def _open_files_error_annotation(mount_path: str) -> Optional[str]:
    if platform.system() != "Linux":
        return None

    self_pid = os.readlink("/proc/self")

    def find_open_file_for_pid(pid: str) -> Optional[str]:
        # /proc/{pid}/cmdline is null separated
        with open(f"/proc/{pid}/cmdline", "rb") as f:
            raw = f.read()
            parts = raw.split(b"\0")
            cmdline = " ".join([part.decode() for part in parts]).rstrip(" ")

        cwd = PurePosixPath(os.readlink(f"/proc/{pid}/cwd"))
        if cwd.is_relative_to(mount_path):
            if pid == self_pid:
                return "cwd is inside volume"
            else:
                return f"cwd of '{cmdline}' is inside volume"

        for fd in os.listdir(f"/proc/{pid}/fd"):
            try:
                path = PurePosixPath(os.readlink(f"/proc/{pid}/fd/{fd}"))
                try:
                    rel_path = path.relative_to(mount_path)
                    if pid == self_pid:
                        return f"path {rel_path} is open"
                    else:
                        return f"path {rel_path} is open from '{cmdline}'"
                except ValueError:
                    pass

            except FileNotFoundError:
                # File was closed
                pass
        return None

    pid_re = re.compile("^[1-9][0-9]*$")
    for dirent in os.listdir("/proc/"):
        if pid_re.match(dirent):
            try:
                annotation = find_open_file_for_pid(dirent)
                if annotation:
                    return annotation
            except (FileNotFoundError, PermissionError):
                pass

    return None
