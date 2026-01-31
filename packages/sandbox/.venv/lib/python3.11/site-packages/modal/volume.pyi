import _io
import asyncio.locks
import collections.abc
import datetime
import enum
import google.protobuf.message
import modal._object
import modal._utils.blob_utils
import modal.client
import modal.object
import modal_proto.api_pb2
import pathlib
import synchronicity
import synchronicity.combined_types
import typing
import typing_extensions

class FileEntryType(enum.IntEnum):
    """Type of a file entry listed from a Modal volume."""

    UNSPECIFIED = 0
    FILE = 1
    DIRECTORY = 2
    SYMLINK = 3
    FIFO = 4
    SOCKET = 5

class FileEntry:
    """A file or directory entry listed from a Modal volume."""

    path: str
    type: FileEntryType
    mtime: int
    size: int

    @classmethod
    def _from_proto(cls, proto: modal_proto.api_pb2.FileEntry) -> FileEntry: ...
    def __init__(self, path: str, type: FileEntryType, mtime: int, size: int) -> None:
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def __repr__(self):
        """Return repr(self)."""
        ...

    def __eq__(self, other):
        """Return self==value."""
        ...

    def __setattr__(self, name, value):
        """Implement setattr(self, name, value)."""
        ...

    def __delattr__(self, name):
        """Implement delattr(self, name)."""
        ...

    def __hash__(self):
        """Return hash(self)."""
        ...

class VolumeInfo:
    """Information about the Volume object."""

    name: typing.Optional[str]
    created_at: datetime.datetime
    created_by: typing.Optional[str]

    def __init__(
        self, name: typing.Optional[str], created_at: datetime.datetime, created_by: typing.Optional[str]
    ) -> None:
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def __repr__(self):
        """Return repr(self)."""
        ...

    def __eq__(self, other):
        """Return self==value."""
        ...

class _VolumeManager:
    """Namespace with methods for managing named Volume objects."""
    @staticmethod
    async def create(
        name: str,
        *,
        version: typing.Optional[int] = None,
        allow_existing: bool = False,
        environment_name: typing.Optional[str] = None,
        client: typing.Optional[modal.client._Client] = None,
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
        ...

    @staticmethod
    async def list(
        *,
        max_objects: typing.Optional[int] = None,
        created_before: typing.Union[datetime.datetime, str, None] = None,
        environment_name: str = "",
        client: typing.Optional[modal.client._Client] = None,
    ) -> list[_Volume]:
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
        ...

    @staticmethod
    async def delete(
        name: str,
        *,
        allow_missing: bool = False,
        environment_name: typing.Optional[str] = None,
        client: typing.Optional[modal.client._Client] = None,
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
        ...

class VolumeManager:
    """Namespace with methods for managing named Volume objects."""
    def __init__(self, /, *args, **kwargs):
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    class __create_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            name: str,
            *,
            version: typing.Optional[int] = None,
            allow_existing: bool = False,
            environment_name: typing.Optional[str] = None,
            client: typing.Optional[modal.client.Client] = None,
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
            ...

        async def aio(
            self,
            /,
            name: str,
            *,
            version: typing.Optional[int] = None,
            allow_existing: bool = False,
            environment_name: typing.Optional[str] = None,
            client: typing.Optional[modal.client.Client] = None,
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
            ...

    create: typing.ClassVar[__create_spec]

    class __list_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            *,
            max_objects: typing.Optional[int] = None,
            created_before: typing.Union[datetime.datetime, str, None] = None,
            environment_name: str = "",
            client: typing.Optional[modal.client.Client] = None,
        ) -> list[Volume]:
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
            ...

        async def aio(
            self,
            /,
            *,
            max_objects: typing.Optional[int] = None,
            created_before: typing.Union[datetime.datetime, str, None] = None,
            environment_name: str = "",
            client: typing.Optional[modal.client.Client] = None,
        ) -> list[Volume]:
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
            ...

    list: typing.ClassVar[__list_spec]

    class __delete_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            name: str,
            *,
            allow_missing: bool = False,
            environment_name: typing.Optional[str] = None,
            client: typing.Optional[modal.client.Client] = None,
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
            ...

        async def aio(
            self,
            /,
            name: str,
            *,
            allow_missing: bool = False,
            environment_name: typing.Optional[str] = None,
            client: typing.Optional[modal.client.Client] = None,
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
            ...

    delete: typing.ClassVar[__delete_spec]

class _Volume(modal._object._Object):
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

    _lock: typing.Optional[asyncio.locks.Lock]
    _metadata: typing.Optional[modal_proto.api_pb2.VolumeMetadata]
    _read_only: bool

    @synchronicity.classproperty
    def objects(cls) -> _VolumeManager: ...
    @property
    def name(self) -> typing.Optional[str]: ...
    def read_only(self) -> _Volume:
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
        ...

    def _hydrate_metadata(self, metadata: typing.Optional[google.protobuf.message.Message]): ...
    def _get_metadata(self) -> typing.Optional[google.protobuf.message.Message]: ...
    async def _get_lock(self): ...
    @property
    def _is_v1(self) -> bool: ...
    @staticmethod
    def from_name(
        name: str,
        *,
        namespace=None,
        environment_name: typing.Optional[str] = None,
        create_if_missing: bool = False,
        version: typing.Optional[int] = None,
        client: typing.Optional[modal.client._Client] = None,
    ) -> _Volume:
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
        ...

    @classmethod
    def ephemeral(
        cls: type[_Volume],
        client: typing.Optional[modal.client._Client] = None,
        environment_name: typing.Optional[str] = None,
        version: typing.Optional[int] = None,
        _heartbeat_sleep: float = 300,
    ) -> typing.AsyncContextManager[_Volume]:
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
        ...

    @staticmethod
    async def create_deployed(
        deployment_name: str,
        namespace=None,
        client: typing.Optional[modal.client._Client] = None,
        environment_name: typing.Optional[str] = None,
        version: typing.Optional[int] = None,
    ) -> str:
        """mdmd:hidden"""
        ...

    @staticmethod
    async def _create_deployed(
        deployment_name: str,
        namespace=None,
        client: typing.Optional[modal.client._Client] = None,
        environment_name: typing.Optional[str] = None,
        version: typing.Optional[int] = None,
    ) -> str:
        """mdmd:hidden"""
        ...

    async def info(self) -> VolumeInfo:
        """Return information about the Volume object."""
        ...

    async def _do_reload(self, lock=True): ...
    async def commit(self):
        """Commit changes to a mounted volume.

        If successful, the changes made are now persisted in durable storage and available to other containers accessing
        the volume.
        """
        ...

    async def reload(self):
        """Make latest committed state of volume available in the running container.

        Any uncommitted changes to the volume, such as new or modified files, may implicitly be committed when
        reloading.

        Reloading will fail if there are open files for the volume.
        """
        ...

    def iterdir(self, path: str, *, recursive: bool = True) -> collections.abc.AsyncIterator[FileEntry]:
        """Iterate over all files in a directory in the volume.

        Passing a directory path lists all files in the directory. For a file path, return only that
        file's description. If `recursive` is set to True, list all files and folders under the path
        recursively.
        """
        ...

    async def listdir(self, path: str, *, recursive: bool = False) -> list[FileEntry]:
        """List all files under a path prefix in the modal.Volume.

        Passing a directory path lists all files in the directory. For a file path, return only that
        file's description. If `recursive` is set to True, list all files and folders under the path
        recursively.
        """
        ...

    def read_file(self, path: str) -> collections.abc.AsyncGenerator[bytes, None]:
        """Read a file from the modal.Volume.

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
        ...

    async def read_file_into_fileobj(
        self,
        path: str,
        fileobj: typing.IO[bytes],
        progress_cb: typing.Optional[collections.abc.Callable[..., typing.Any]] = None,
    ) -> int:
        """mdmd:hidden
        Read volume file into file-like IO object.
        """
        ...

    async def _read_file_into_fileobj(
        self,
        path: str,
        fileobj: typing.IO[bytes],
        concurrency: typing.Optional[int] = None,
        download_semaphore: typing.Optional[asyncio.locks.Semaphore] = None,
        progress_cb: typing.Optional[collections.abc.Callable[..., typing.Any]] = None,
    ) -> int: ...
    async def remove_file(self, path: str, recursive: bool = False) -> None:
        """Remove a file or directory from a volume."""
        ...

    async def copy_files(
        self, src_paths: collections.abc.Sequence[str], dst_path: str, recursive: bool = False
    ) -> None:
        """Copy files within the volume from src_paths to dst_path.
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
        ...

    def batch_upload(self, force: bool = False) -> typing.AsyncContextManager[_AbstractVolumeUploadContextManager]:
        """Initiate a batched upload to a volume.

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
        ...

    async def _instance_delete(self): ...
    @staticmethod
    async def delete(
        name: str, client: typing.Optional[modal.client._Client] = None, environment_name: typing.Optional[str] = None
    ):
        """mdmd:hidden
        Delete a named Volume.

        Warning: This deletes an *entire Volume*, not just a specific file.
        Deletion is irreversible and will affect any Apps currently using the Volume.

        DEPRECATED: This method is deprecated; we recommend using `modal.Volume.objects.delete` instead.
        """
        ...

    @staticmethod
    async def rename(
        old_name: str,
        new_name: str,
        *,
        client: typing.Optional[modal.client._Client] = None,
        environment_name: typing.Optional[str] = None,
    ): ...

class Volume(modal.object.Object):
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

    _lock: typing.Optional[asyncio.locks.Lock]
    _metadata: typing.Optional[modal_proto.api_pb2.VolumeMetadata]
    _read_only: bool

    def __init__(self, *args, **kwargs):
        """mdmd:hidden"""
        ...

    @synchronicity.classproperty
    def objects(cls) -> VolumeManager: ...
    @property
    def name(self) -> typing.Optional[str]: ...
    def read_only(self) -> Volume:
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
        ...

    def _hydrate_metadata(self, metadata: typing.Optional[google.protobuf.message.Message]): ...
    def _get_metadata(self) -> typing.Optional[google.protobuf.message.Message]: ...

    class ___get_lock_spec(typing_extensions.Protocol):
        def __call__(self, /): ...
        async def aio(self, /): ...

    _get_lock: ___get_lock_spec

    @property
    def _is_v1(self) -> bool: ...
    @staticmethod
    def from_name(
        name: str,
        *,
        namespace=None,
        environment_name: typing.Optional[str] = None,
        create_if_missing: bool = False,
        version: typing.Optional[int] = None,
        client: typing.Optional[modal.client.Client] = None,
    ) -> Volume:
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
        ...

    class __ephemeral_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
            version: typing.Optional[int] = None,
            _heartbeat_sleep: float = 300,
        ) -> synchronicity.combined_types.AsyncAndBlockingContextManager[Volume]:
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
            ...

        def aio(
            self,
            /,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
            version: typing.Optional[int] = None,
            _heartbeat_sleep: float = 300,
        ) -> typing.AsyncContextManager[Volume]:
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
            ...

    ephemeral: typing.ClassVar[__ephemeral_spec]

    class __create_deployed_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            deployment_name: str,
            namespace=None,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
            version: typing.Optional[int] = None,
        ) -> str:
            """mdmd:hidden"""
            ...

        async def aio(
            self,
            /,
            deployment_name: str,
            namespace=None,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
            version: typing.Optional[int] = None,
        ) -> str:
            """mdmd:hidden"""
            ...

    create_deployed: typing.ClassVar[__create_deployed_spec]

    class ___create_deployed_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            deployment_name: str,
            namespace=None,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
            version: typing.Optional[int] = None,
        ) -> str:
            """mdmd:hidden"""
            ...

        async def aio(
            self,
            /,
            deployment_name: str,
            namespace=None,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
            version: typing.Optional[int] = None,
        ) -> str:
            """mdmd:hidden"""
            ...

    _create_deployed: typing.ClassVar[___create_deployed_spec]

    class __info_spec(typing_extensions.Protocol):
        def __call__(self, /) -> VolumeInfo:
            """Return information about the Volume object."""
            ...

        async def aio(self, /) -> VolumeInfo:
            """Return information about the Volume object."""
            ...

    info: __info_spec

    class ___do_reload_spec(typing_extensions.Protocol):
        def __call__(self, /, lock=True): ...
        async def aio(self, /, lock=True): ...

    _do_reload: ___do_reload_spec

    class __commit_spec(typing_extensions.Protocol):
        def __call__(self, /):
            """Commit changes to a mounted volume.

            If successful, the changes made are now persisted in durable storage and available to other containers accessing
            the volume.
            """
            ...

        async def aio(self, /):
            """Commit changes to a mounted volume.

            If successful, the changes made are now persisted in durable storage and available to other containers accessing
            the volume.
            """
            ...

    commit: __commit_spec

    class __reload_spec(typing_extensions.Protocol):
        def __call__(self, /):
            """Make latest committed state of volume available in the running container.

            Any uncommitted changes to the volume, such as new or modified files, may implicitly be committed when
            reloading.

            Reloading will fail if there are open files for the volume.
            """
            ...

        async def aio(self, /):
            """Make latest committed state of volume available in the running container.

            Any uncommitted changes to the volume, such as new or modified files, may implicitly be committed when
            reloading.

            Reloading will fail if there are open files for the volume.
            """
            ...

    reload: __reload_spec

    class __iterdir_spec(typing_extensions.Protocol):
        def __call__(self, /, path: str, *, recursive: bool = True) -> typing.Iterator[FileEntry]:
            """Iterate over all files in a directory in the volume.

            Passing a directory path lists all files in the directory. For a file path, return only that
            file's description. If `recursive` is set to True, list all files and folders under the path
            recursively.
            """
            ...

        def aio(self, /, path: str, *, recursive: bool = True) -> collections.abc.AsyncIterator[FileEntry]:
            """Iterate over all files in a directory in the volume.

            Passing a directory path lists all files in the directory. For a file path, return only that
            file's description. If `recursive` is set to True, list all files and folders under the path
            recursively.
            """
            ...

    iterdir: __iterdir_spec

    class __listdir_spec(typing_extensions.Protocol):
        def __call__(self, /, path: str, *, recursive: bool = False) -> list[FileEntry]:
            """List all files under a path prefix in the modal.Volume.

            Passing a directory path lists all files in the directory. For a file path, return only that
            file's description. If `recursive` is set to True, list all files and folders under the path
            recursively.
            """
            ...

        async def aio(self, /, path: str, *, recursive: bool = False) -> list[FileEntry]:
            """List all files under a path prefix in the modal.Volume.

            Passing a directory path lists all files in the directory. For a file path, return only that
            file's description. If `recursive` is set to True, list all files and folders under the path
            recursively.
            """
            ...

    listdir: __listdir_spec

    class __read_file_spec(typing_extensions.Protocol):
        def __call__(self, /, path: str) -> typing.Generator[bytes, None, None]:
            """Read a file from the modal.Volume.

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
            ...

        def aio(self, /, path: str) -> collections.abc.AsyncGenerator[bytes, None]:
            """Read a file from the modal.Volume.

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
            ...

    read_file: __read_file_spec

    class __read_file_into_fileobj_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            path: str,
            fileobj: typing.IO[bytes],
            progress_cb: typing.Optional[collections.abc.Callable[..., typing.Any]] = None,
        ) -> int:
            """mdmd:hidden
            Read volume file into file-like IO object.
            """
            ...

        async def aio(
            self,
            /,
            path: str,
            fileobj: typing.IO[bytes],
            progress_cb: typing.Optional[collections.abc.Callable[..., typing.Any]] = None,
        ) -> int:
            """mdmd:hidden
            Read volume file into file-like IO object.
            """
            ...

    read_file_into_fileobj: __read_file_into_fileobj_spec

    class ___read_file_into_fileobj_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            path: str,
            fileobj: typing.IO[bytes],
            concurrency: typing.Optional[int] = None,
            download_semaphore: typing.Optional[asyncio.locks.Semaphore] = None,
            progress_cb: typing.Optional[collections.abc.Callable[..., typing.Any]] = None,
        ) -> int: ...
        async def aio(
            self,
            /,
            path: str,
            fileobj: typing.IO[bytes],
            concurrency: typing.Optional[int] = None,
            download_semaphore: typing.Optional[asyncio.locks.Semaphore] = None,
            progress_cb: typing.Optional[collections.abc.Callable[..., typing.Any]] = None,
        ) -> int: ...

    _read_file_into_fileobj: ___read_file_into_fileobj_spec

    class __remove_file_spec(typing_extensions.Protocol):
        def __call__(self, /, path: str, recursive: bool = False) -> None:
            """Remove a file or directory from a volume."""
            ...

        async def aio(self, /, path: str, recursive: bool = False) -> None:
            """Remove a file or directory from a volume."""
            ...

    remove_file: __remove_file_spec

    class __copy_files_spec(typing_extensions.Protocol):
        def __call__(self, /, src_paths: collections.abc.Sequence[str], dst_path: str, recursive: bool = False) -> None:
            """Copy files within the volume from src_paths to dst_path.
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
            ...

        async def aio(
            self, /, src_paths: collections.abc.Sequence[str], dst_path: str, recursive: bool = False
        ) -> None:
            """Copy files within the volume from src_paths to dst_path.
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
            ...

    copy_files: __copy_files_spec

    class __batch_upload_spec(typing_extensions.Protocol):
        def __call__(
            self, /, force: bool = False
        ) -> synchronicity.combined_types.AsyncAndBlockingContextManager[AbstractVolumeUploadContextManager]:
            """Initiate a batched upload to a volume.

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
            ...

        def aio(self, /, force: bool = False) -> typing.AsyncContextManager[AbstractVolumeUploadContextManager]:
            """Initiate a batched upload to a volume.

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
            ...

    batch_upload: __batch_upload_spec

    class ___instance_delete_spec(typing_extensions.Protocol):
        def __call__(self, /): ...
        async def aio(self, /): ...

    _instance_delete: ___instance_delete_spec

    class __delete_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            name: str,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
        ):
            """mdmd:hidden
            Delete a named Volume.

            Warning: This deletes an *entire Volume*, not just a specific file.
            Deletion is irreversible and will affect any Apps currently using the Volume.

            DEPRECATED: This method is deprecated; we recommend using `modal.Volume.objects.delete` instead.
            """
            ...

        async def aio(
            self,
            /,
            name: str,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
        ):
            """mdmd:hidden
            Delete a named Volume.

            Warning: This deletes an *entire Volume*, not just a specific file.
            Deletion is irreversible and will affect any Apps currently using the Volume.

            DEPRECATED: This method is deprecated; we recommend using `modal.Volume.objects.delete` instead.
            """
            ...

    delete: typing.ClassVar[__delete_spec]

    class __rename_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            old_name: str,
            new_name: str,
            *,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
        ): ...
        async def aio(
            self,
            /,
            old_name: str,
            new_name: str,
            *,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
        ): ...

    rename: typing.ClassVar[__rename_spec]

class _AbstractVolumeUploadContextManager:
    async def __aenter__(self): ...
    async def __aexit__(self, exc_type, exc_val, exc_tb): ...
    def put_file(
        self,
        local_file: typing.Union[pathlib.Path, str, typing.BinaryIO, _io.BytesIO],
        remote_path: typing.Union[pathlib.PurePosixPath, str],
        mode: typing.Optional[int] = None,
    ): ...
    def put_directory(
        self,
        local_path: typing.Union[pathlib.Path, str],
        remote_path: typing.Union[pathlib.PurePosixPath, str],
        recursive: bool = True,
    ): ...
    @staticmethod
    def resolve(
        version: int,
        object_id: str,
        client,
        progress_cb: typing.Optional[collections.abc.Callable[..., typing.Any]] = None,
        force: bool = False,
    ) -> _AbstractVolumeUploadContextManager: ...

class AbstractVolumeUploadContextManager:
    def __init__(self, /, *args, **kwargs):
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def __enter__(self): ...
    async def __aenter__(self): ...
    def __exit__(self, exc_type, exc_val, exc_tb): ...
    async def __aexit__(self, exc_type, exc_val, exc_tb): ...
    def put_file(
        self,
        local_file: typing.Union[pathlib.Path, str, typing.BinaryIO, _io.BytesIO],
        remote_path: typing.Union[pathlib.PurePosixPath, str],
        mode: typing.Optional[int] = None,
    ): ...
    def put_directory(
        self,
        local_path: typing.Union[pathlib.Path, str],
        remote_path: typing.Union[pathlib.PurePosixPath, str],
        recursive: bool = True,
    ): ...
    @staticmethod
    def resolve(
        version: int,
        object_id: str,
        client,
        progress_cb: typing.Optional[collections.abc.Callable[..., typing.Any]] = None,
        force: bool = False,
    ) -> AbstractVolumeUploadContextManager: ...

class _VolumeUploadContextManager(_AbstractVolumeUploadContextManager):
    """Context manager for batch-uploading files to a Volume."""

    _volume_id: str
    _client: modal.client._Client
    _force: bool
    progress_cb: collections.abc.Callable[..., typing.Any]
    _upload_generators: list[
        collections.abc.Generator[collections.abc.Callable[[], modal._utils.blob_utils.FileUploadSpec], None, None]
    ]

    def __init__(
        self,
        volume_id: str,
        client: modal.client._Client,
        progress_cb: typing.Optional[collections.abc.Callable[..., typing.Any]] = None,
        force: bool = False,
    ):
        """mdmd:hidden"""
        ...

    async def __aenter__(self): ...
    async def __aexit__(self, exc_type, exc_val, exc_tb): ...
    def put_file(
        self,
        local_file: typing.Union[pathlib.Path, str, typing.BinaryIO, _io.BytesIO],
        remote_path: typing.Union[pathlib.PurePosixPath, str],
        mode: typing.Optional[int] = None,
    ):
        """Upload a file from a local file or file-like object.

        Will create any needed parent directories automatically.

        If `local_file` is a file-like object it must remain readable for the lifetime of the batch.
        """
        ...

    def put_directory(
        self,
        local_path: typing.Union[pathlib.Path, str],
        remote_path: typing.Union[pathlib.PurePosixPath, str],
        recursive: bool = True,
    ):
        """Upload all files in a local directory.

        Will create any needed parent directories automatically.
        """
        ...

    async def _upload_file(
        self, file_spec: modal._utils.blob_utils.FileUploadSpec
    ) -> modal_proto.api_pb2.MountFile: ...

class VolumeUploadContextManager(AbstractVolumeUploadContextManager):
    """Context manager for batch-uploading files to a Volume."""

    _volume_id: str
    _client: modal.client.Client
    _force: bool
    progress_cb: collections.abc.Callable[..., typing.Any]
    _upload_generators: list[
        collections.abc.Generator[collections.abc.Callable[[], modal._utils.blob_utils.FileUploadSpec], None, None]
    ]

    def __init__(
        self,
        volume_id: str,
        client: modal.client.Client,
        progress_cb: typing.Optional[collections.abc.Callable[..., typing.Any]] = None,
        force: bool = False,
    ):
        """mdmd:hidden"""
        ...

    def __enter__(self): ...
    async def __aenter__(self): ...
    def __exit__(self, exc_type, exc_val, exc_tb): ...
    async def __aexit__(self, exc_type, exc_val, exc_tb): ...
    def put_file(
        self,
        local_file: typing.Union[pathlib.Path, str, typing.BinaryIO, _io.BytesIO],
        remote_path: typing.Union[pathlib.PurePosixPath, str],
        mode: typing.Optional[int] = None,
    ):
        """Upload a file from a local file or file-like object.

        Will create any needed parent directories automatically.

        If `local_file` is a file-like object it must remain readable for the lifetime of the batch.
        """
        ...

    def put_directory(
        self,
        local_path: typing.Union[pathlib.Path, str],
        remote_path: typing.Union[pathlib.PurePosixPath, str],
        recursive: bool = True,
    ):
        """Upload all files in a local directory.

        Will create any needed parent directories automatically.
        """
        ...

    class ___upload_file_spec(typing_extensions.Protocol):
        def __call__(self, /, file_spec: modal._utils.blob_utils.FileUploadSpec) -> modal_proto.api_pb2.MountFile: ...
        async def aio(self, /, file_spec: modal._utils.blob_utils.FileUploadSpec) -> modal_proto.api_pb2.MountFile: ...

    _upload_file: ___upload_file_spec

class _VolumeUploadContextManager2(_AbstractVolumeUploadContextManager):
    """Context manager for batch-uploading files to a Volume version 2."""

    _volume_id: str
    _client: modal.client._Client
    _progress_cb: collections.abc.Callable[..., typing.Any]
    _force: bool
    _hash_concurrency: int
    _put_concurrency: int
    _uploader_generators: list[
        collections.abc.Generator[
            collections.abc.Callable[
                [asyncio.locks.Semaphore], typing.Awaitable[modal._utils.blob_utils.FileUploadSpec2]
            ]
        ]
    ]

    def __init__(
        self,
        volume_id: str,
        client: modal.client._Client,
        progress_cb: typing.Optional[collections.abc.Callable[..., typing.Any]] = None,
        force: bool = False,
        hash_concurrency: int = 2,
        put_concurrency: int = 128,
    ):
        """mdmd:hidden"""
        ...

    async def __aenter__(self): ...
    async def __aexit__(self, exc_type, exc_val, exc_tb): ...
    def put_file(
        self,
        local_file: typing.Union[pathlib.Path, str, typing.BinaryIO, _io.BytesIO],
        remote_path: typing.Union[pathlib.PurePosixPath, str],
        mode: typing.Optional[int] = None,
    ):
        """Upload a file from a local file or file-like object.

        Will create any needed parent directories automatically.

        If `local_file` is a file-like object it must remain readable for the lifetime of the batch.
        """
        ...

    def put_directory(
        self,
        local_path: typing.Union[pathlib.Path, str],
        remote_path: typing.Union[pathlib.PurePosixPath, str],
        recursive: bool = True,
    ):
        """Upload all files in a local directory.

        Will create any needed parent directories automatically.
        """
        ...

    async def _put_file_specs(self, file_specs: list[modal._utils.blob_utils.FileUploadSpec2]): ...

class VolumeUploadContextManager2(AbstractVolumeUploadContextManager):
    """Context manager for batch-uploading files to a Volume version 2."""

    _volume_id: str
    _client: modal.client.Client
    _progress_cb: collections.abc.Callable[..., typing.Any]
    _force: bool
    _hash_concurrency: int
    _put_concurrency: int
    _uploader_generators: list[
        collections.abc.Generator[
            collections.abc.Callable[
                [asyncio.locks.Semaphore], typing.Awaitable[modal._utils.blob_utils.FileUploadSpec2]
            ]
        ]
    ]

    def __init__(
        self,
        volume_id: str,
        client: modal.client.Client,
        progress_cb: typing.Optional[collections.abc.Callable[..., typing.Any]] = None,
        force: bool = False,
        hash_concurrency: int = 2,
        put_concurrency: int = 128,
    ):
        """mdmd:hidden"""
        ...

    def __enter__(self): ...
    async def __aenter__(self): ...
    def __exit__(self, exc_type, exc_val, exc_tb): ...
    async def __aexit__(self, exc_type, exc_val, exc_tb): ...
    def put_file(
        self,
        local_file: typing.Union[pathlib.Path, str, typing.BinaryIO, _io.BytesIO],
        remote_path: typing.Union[pathlib.PurePosixPath, str],
        mode: typing.Optional[int] = None,
    ):
        """Upload a file from a local file or file-like object.

        Will create any needed parent directories automatically.

        If `local_file` is a file-like object it must remain readable for the lifetime of the batch.
        """
        ...

    def put_directory(
        self,
        local_path: typing.Union[pathlib.Path, str],
        remote_path: typing.Union[pathlib.PurePosixPath, str],
        recursive: bool = True,
    ):
        """Upload all files in a local directory.

        Will create any needed parent directories automatically.
        """
        ...

    class ___put_file_specs_spec(typing_extensions.Protocol):
        def __call__(self, /, file_specs: list[modal._utils.blob_utils.FileUploadSpec2]): ...
        async def aio(self, /, file_specs: list[modal._utils.blob_utils.FileUploadSpec2]): ...

    _put_file_specs: ___put_file_specs_spec

async def _put_missing_blocks(
    file_specs: list[modal._utils.blob_utils.FileUploadSpec2],
    missing_blocks: list,
    put_responses: dict[bytes, bytes],
    put_concurrency: int,
    progress_cb: collections.abc.Callable[..., typing.Any],
): ...
def _open_files_error_annotation(mount_path: str) -> typing.Optional[str]: ...
