# Copyright Modal Labs 2023
import functools
import os
import time
from collections.abc import AsyncIterator
from pathlib import Path, PurePosixPath
from typing import Any, BinaryIO, Callable, Optional, Union

from synchronicity.async_wrap import asynccontextmanager

import modal
from modal_proto import api_pb2

from ._load_context import LoadContext
from ._object import (
    EPHEMERAL_OBJECT_HEARTBEAT_SLEEP,
    _get_environment_name,
    _Object,
    live_method,
    live_method_gen,
)
from ._resolver import Resolver
from ._utils.async_utils import TaskContext, aclosing, async_map, sync_or_async_iter, synchronize_api
from ._utils.blob_utils import LARGE_FILE_LIMIT, blob_iter, blob_upload_file
from ._utils.deprecation import warn_if_passing_namespace
from ._utils.hash_utils import get_sha256_hex
from ._utils.name_utils import check_object_name
from .client import _Client
from .exception import InvalidError
from .volume import FileEntry

NETWORK_FILE_SYSTEM_PUT_FILE_CLIENT_TIMEOUT = (
    10 * 60
)  # 10 min max for transferring files (does not include upload time to s3)


def network_file_system_mount_protos(
    validated_network_file_systems: list[tuple[str, "_NetworkFileSystem"]],
) -> list[api_pb2.SharedVolumeMount]:
    network_file_system_mounts = []
    # Relies on dicts being ordered (true as of Python 3.6).
    for path, volume in validated_network_file_systems:
        network_file_system_mounts.append(
            api_pb2.SharedVolumeMount(
                mount_path=path,
                shared_volume_id=volume.object_id,
            )
        )
    return network_file_system_mounts


class _NetworkFileSystem(_Object, type_prefix="sv"):
    """A shared, writable file system accessible by one or more Modal functions.

    By attaching this file system as a mount to one or more functions, they can
    share and persist data with each other.

    **Note: `NetworkFileSystem` has been deprecated and will be removed.**

    **Usage**

    ```python
    import modal

    nfs = modal.NetworkFileSystem.from_name("my-nfs", create_if_missing=True)
    app = modal.App()

    @app.function(network_file_systems={"/root/foo": nfs})
    def f():
        pass

    @app.function(network_file_systems={"/root/goo": nfs})
    def g():
        pass
    ```

    Also see the CLI methods for accessing network file systems:

    ```
    modal nfs --help
    ```

    A `NetworkFileSystem` can also be useful for some local scripting scenarios, e.g.:

    ```python notest
    nfs = modal.NetworkFileSystem.from_name("my-network-file-system")
    for chunk in nfs.read_file("my_db_dump.csv"):
        ...
    ```
    """

    @staticmethod
    def from_name(
        name: str,
        *,
        namespace=None,  # mdmd:line-hidden
        environment_name: Optional[str] = None,
        create_if_missing: bool = False,
        client: Optional[_Client] = None,
    ) -> "_NetworkFileSystem":
        """Reference a NetworkFileSystem by its name, creating if necessary.

        This is a lazy method that defers hydrating the local object with
        metadata from Modal servers until the first time it is actually
        used.

        ```python notest
        nfs = NetworkFileSystem.from_name("my-nfs", create_if_missing=True)

        @app.function(network_file_systems={"/data": nfs})
        def f():
            pass
        ```
        """
        check_object_name(name, "NetworkFileSystem")
        warn_if_passing_namespace(namespace, "modal.NetworkFileSystem.from_name")

        async def _load(
            self: _NetworkFileSystem, resolver: Resolver, load_context: LoadContext, existing_object_id: Optional[str]
        ):
            req = api_pb2.SharedVolumeGetOrCreateRequest(
                deployment_name=name,
                environment_name=load_context.environment_name,
                object_creation_type=(api_pb2.OBJECT_CREATION_TYPE_CREATE_IF_MISSING if create_if_missing else None),
            )
            try:
                response = await load_context.client.stub.SharedVolumeGetOrCreate(req)
                self._hydrate(response.shared_volume_id, load_context.client, None)
            except modal.exception.NotFoundError as exc:
                if exc.args[0] == "App has wrong entity vo":
                    raise InvalidError(
                        f"Attempted to mount: `{name}` as a NetworkFileSystem " + "which already exists as a Volume"
                    )
                raise

        return _NetworkFileSystem._from_loader(
            _load,
            "NetworkFileSystem()",
            hydrate_lazily=True,
            load_context_overrides=LoadContext(environment_name=environment_name, client=client),
        )

    @classmethod
    @asynccontextmanager
    async def ephemeral(
        cls: type["_NetworkFileSystem"],
        client: Optional[_Client] = None,
        environment_name: Optional[str] = None,
        _heartbeat_sleep: float = EPHEMERAL_OBJECT_HEARTBEAT_SLEEP,  # mdmd:line-hidden
    ) -> AsyncIterator["_NetworkFileSystem"]:
        """Creates a new ephemeral network filesystem within a context manager:

        Usage:
        ```python
        with modal.NetworkFileSystem.ephemeral() as nfs:
            assert nfs.listdir("/") == []
        ```

        ```python notest
        async with modal.NetworkFileSystem.ephemeral() as nfs:
            assert await nfs.listdir("/") == []
        ```
        """
        if client is None:
            client = await _Client.from_env()
        request = api_pb2.SharedVolumeGetOrCreateRequest(
            object_creation_type=api_pb2.OBJECT_CREATION_TYPE_EPHEMERAL,
            environment_name=_get_environment_name(environment_name),
        )
        response = await client.stub.SharedVolumeGetOrCreate(request)
        async with TaskContext() as tc:
            request = api_pb2.SharedVolumeHeartbeatRequest(shared_volume_id=response.shared_volume_id)
            tc.infinite_loop(lambda: client.stub.SharedVolumeHeartbeat(request), sleep=_heartbeat_sleep)
            yield cls._new_hydrated(
                response.shared_volume_id,
                client,
                None,
                is_another_app=True,
                rep="modal.NetworkFileSystem.ephemeral()",
            )

    @staticmethod
    async def create_deployed(
        deployment_name: str,
        namespace=None,  # mdmd:line-hidden
        client: Optional[_Client] = None,
        environment_name: Optional[str] = None,
    ) -> str:
        """mdmd:hidden"""
        check_object_name(deployment_name, "NetworkFileSystem")
        warn_if_passing_namespace(namespace, "modal.NetworkFileSystem.create_deployed")
        if client is None:
            client = await _Client.from_env()
        request = api_pb2.SharedVolumeGetOrCreateRequest(
            deployment_name=deployment_name,
            environment_name=_get_environment_name(environment_name),
            object_creation_type=api_pb2.OBJECT_CREATION_TYPE_CREATE_FAIL_IF_EXISTS,
        )
        resp = await client.stub.SharedVolumeGetOrCreate(request)
        return resp.shared_volume_id

    @staticmethod
    async def delete(name: str, client: Optional[_Client] = None, environment_name: Optional[str] = None):
        obj = await _NetworkFileSystem.from_name(name, environment_name=environment_name).hydrate(client)
        req = api_pb2.SharedVolumeDeleteRequest(shared_volume_id=obj.object_id)
        await obj._client.stub.SharedVolumeDelete(req)

    @live_method
    async def write_file(self, remote_path: str, fp: BinaryIO, progress_cb: Optional[Callable[..., Any]] = None) -> int:
        """Write from a file object to a path on the network file system, atomically.

        Will create any needed parent directories automatically.

        If remote_path ends with `/` it's assumed to be a directory and the
        file will be uploaded with its current name to that directory.
        """
        progress_cb = progress_cb or (lambda *_, **__: None)

        sha_hash = get_sha256_hex(fp)
        fp.seek(0, os.SEEK_END)
        data_size = fp.tell()
        fp.seek(0)
        if data_size > LARGE_FILE_LIMIT:
            progress_task_id = progress_cb(name=remote_path, size=data_size)
            blob_id = await blob_upload_file(
                fp,
                self._client.stub,
                progress_report_cb=functools.partial(progress_cb, progress_task_id),
                sha256_hex=sha_hash,
            )
            req = api_pb2.SharedVolumePutFileRequest(
                shared_volume_id=self.object_id,
                path=remote_path,
                data_blob_id=blob_id,
                sha256_hex=sha_hash,
                resumable=True,
            )
        else:
            data = fp.read()
            req = api_pb2.SharedVolumePutFileRequest(
                shared_volume_id=self.object_id, path=remote_path, data=data, resumable=True
            )

        t0 = time.monotonic()
        while time.monotonic() - t0 < NETWORK_FILE_SYSTEM_PUT_FILE_CLIENT_TIMEOUT:
            response = await self._client.stub.SharedVolumePutFile(req)
            if response.exists:
                break
        else:
            raise modal.exception.TimeoutError(f"Uploading of {remote_path} timed out")

        return data_size  # might be better if this is returned from the server

    @live_method_gen
    async def read_file(self, path: str) -> AsyncIterator[bytes]:
        """Read a file from the network file system"""
        req = api_pb2.SharedVolumeGetFileRequest(shared_volume_id=self.object_id, path=path)
        try:
            response = await self._client.stub.SharedVolumeGetFile(req)
        except modal.exception.NotFoundError as exc:
            raise FileNotFoundError(exc.args[0])

        if response.WhichOneof("data_oneof") == "data":
            yield response.data
        else:
            async for data in blob_iter(response.data_blob_id, self._client.stub):
                yield data

    @live_method_gen
    async def iterdir(self, path: str) -> AsyncIterator[FileEntry]:
        """Iterate over all files in a directory in the network file system.

        * Passing a directory path lists all files in the directory (names are relative to the directory)
        * Passing a file path returns a list containing only that file's listing description
        * Passing a glob path (including at least one * or ** sequence) returns all files matching
        that glob path (using absolute paths)
        """
        req = api_pb2.SharedVolumeListFilesRequest(shared_volume_id=self.object_id, path=path)
        async for batch in self._client.stub.SharedVolumeListFilesStream.unary_stream(req):
            for entry in batch.entries:
                yield FileEntry._from_proto(entry)

    @live_method
    async def add_local_file(
        self,
        local_path: Union[Path, str],
        remote_path: Optional[Union[str, PurePosixPath, None]] = None,
        progress_cb: Optional[Callable[..., Any]] = None,
    ):
        local_path = Path(local_path)
        if remote_path is None:
            remote_path = PurePosixPath("/", local_path.name).as_posix()
        else:
            remote_path = PurePosixPath(remote_path).as_posix()

        with local_path.open("rb") as local_file:
            return await self.write_file(remote_path, local_file, progress_cb=progress_cb)

    @live_method
    async def add_local_dir(
        self,
        local_path: Union[Path, str],
        remote_path: Optional[Union[str, PurePosixPath, None]] = None,
        progress_cb: Optional[Callable[..., Any]] = None,
    ):
        _local_path = Path(local_path)
        if remote_path is None:
            remote_path = PurePosixPath("/", _local_path.name).as_posix()
        else:
            remote_path = PurePosixPath(remote_path).as_posix()

        assert _local_path.is_dir()

        def gen_transfers():
            for subpath in _local_path.rglob("*"):
                if subpath.is_dir():
                    continue
                relpath_str = subpath.relative_to(_local_path).as_posix()
                yield subpath, PurePosixPath(remote_path, relpath_str)

        async def _add_local_file(paths: tuple[Path, PurePosixPath]) -> int:
            return await self.add_local_file(paths[0], paths[1], progress_cb)

        async with aclosing(async_map(sync_or_async_iter(gen_transfers()), _add_local_file, concurrency=20)) as stream:
            async for _ in stream:  # consume/execute the map
                pass

    @live_method
    async def listdir(self, path: str) -> list[FileEntry]:
        """List all files in a directory in the network file system.

        * Passing a directory path lists all files in the directory (names are relative to the directory)
        * Passing a file path returns a list containing only that file's listing description
        * Passing a glob path (including at least one * or ** sequence) returns all files matching
        that glob path (using absolute paths)
        """
        return [entry async for entry in self.iterdir(path)]

    @live_method
    async def remove_file(self, path: str, recursive=False):
        """Remove a file in a network file system."""
        req = api_pb2.SharedVolumeRemoveFileRequest(shared_volume_id=self.object_id, path=path, recursive=recursive)
        try:
            await self._client.stub.SharedVolumeRemoveFile(req)
        except modal.exception.NotFoundError as exc:
            raise FileNotFoundError(exc.args[0])


NetworkFileSystem = synchronize_api(_NetworkFileSystem)
