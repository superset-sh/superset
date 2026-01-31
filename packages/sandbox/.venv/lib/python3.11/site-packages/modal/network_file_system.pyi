import collections.abc
import modal._object
import modal.client
import modal.object
import modal.volume
import modal_proto.api_pb2
import pathlib
import synchronicity.combined_types
import typing
import typing_extensions

def network_file_system_mount_protos(
    validated_network_file_systems: list[tuple[str, _NetworkFileSystem]],
) -> list[modal_proto.api_pb2.SharedVolumeMount]: ...

class _NetworkFileSystem(modal._object._Object):
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
        namespace=None,
        environment_name: typing.Optional[str] = None,
        create_if_missing: bool = False,
        client: typing.Optional[modal.client._Client] = None,
    ) -> _NetworkFileSystem:
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
        ...

    @classmethod
    def ephemeral(
        cls: type[_NetworkFileSystem],
        client: typing.Optional[modal.client._Client] = None,
        environment_name: typing.Optional[str] = None,
        _heartbeat_sleep: float = 300,
    ) -> typing.AsyncContextManager[_NetworkFileSystem]:
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
        ...

    @staticmethod
    async def create_deployed(
        deployment_name: str,
        namespace=None,
        client: typing.Optional[modal.client._Client] = None,
        environment_name: typing.Optional[str] = None,
    ) -> str:
        """mdmd:hidden"""
        ...

    @staticmethod
    async def delete(
        name: str, client: typing.Optional[modal.client._Client] = None, environment_name: typing.Optional[str] = None
    ): ...
    async def write_file(
        self,
        remote_path: str,
        fp: typing.BinaryIO,
        progress_cb: typing.Optional[collections.abc.Callable[..., typing.Any]] = None,
    ) -> int:
        """Write from a file object to a path on the network file system, atomically.

        Will create any needed parent directories automatically.

        If remote_path ends with `/` it's assumed to be a directory and the
        file will be uploaded with its current name to that directory.
        """
        ...

    def read_file(self, path: str) -> collections.abc.AsyncIterator[bytes]:
        """Read a file from the network file system"""
        ...

    def iterdir(self, path: str) -> collections.abc.AsyncIterator[modal.volume.FileEntry]:
        """Iterate over all files in a directory in the network file system.

        * Passing a directory path lists all files in the directory (names are relative to the directory)
        * Passing a file path returns a list containing only that file's listing description
        * Passing a glob path (including at least one * or ** sequence) returns all files matching
        that glob path (using absolute paths)
        """
        ...

    async def add_local_file(
        self,
        local_path: typing.Union[pathlib.Path, str],
        remote_path: typing.Union[str, pathlib.PurePosixPath, None] = None,
        progress_cb: typing.Optional[collections.abc.Callable[..., typing.Any]] = None,
    ): ...
    async def add_local_dir(
        self,
        local_path: typing.Union[pathlib.Path, str],
        remote_path: typing.Union[str, pathlib.PurePosixPath, None] = None,
        progress_cb: typing.Optional[collections.abc.Callable[..., typing.Any]] = None,
    ): ...
    async def listdir(self, path: str) -> list[modal.volume.FileEntry]:
        """List all files in a directory in the network file system.

        * Passing a directory path lists all files in the directory (names are relative to the directory)
        * Passing a file path returns a list containing only that file's listing description
        * Passing a glob path (including at least one * or ** sequence) returns all files matching
        that glob path (using absolute paths)
        """
        ...

    async def remove_file(self, path: str, recursive=False):
        """Remove a file in a network file system."""
        ...

class NetworkFileSystem(modal.object.Object):
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
    def __init__(self, *args, **kwargs):
        """mdmd:hidden"""
        ...

    @staticmethod
    def from_name(
        name: str,
        *,
        namespace=None,
        environment_name: typing.Optional[str] = None,
        create_if_missing: bool = False,
        client: typing.Optional[modal.client.Client] = None,
    ) -> NetworkFileSystem:
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
        ...

    class __ephemeral_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
            _heartbeat_sleep: float = 300,
        ) -> synchronicity.combined_types.AsyncAndBlockingContextManager[NetworkFileSystem]:
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
            ...

        def aio(
            self,
            /,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
            _heartbeat_sleep: float = 300,
        ) -> typing.AsyncContextManager[NetworkFileSystem]:
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
        ) -> str:
            """mdmd:hidden"""
            ...

    create_deployed: typing.ClassVar[__create_deployed_spec]

    class __delete_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            name: str,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
        ): ...
        async def aio(
            self,
            /,
            name: str,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
        ): ...

    delete: typing.ClassVar[__delete_spec]

    class __write_file_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            remote_path: str,
            fp: typing.BinaryIO,
            progress_cb: typing.Optional[collections.abc.Callable[..., typing.Any]] = None,
        ) -> int:
            """Write from a file object to a path on the network file system, atomically.

            Will create any needed parent directories automatically.

            If remote_path ends with `/` it's assumed to be a directory and the
            file will be uploaded with its current name to that directory.
            """
            ...

        async def aio(
            self,
            /,
            remote_path: str,
            fp: typing.BinaryIO,
            progress_cb: typing.Optional[collections.abc.Callable[..., typing.Any]] = None,
        ) -> int:
            """Write from a file object to a path on the network file system, atomically.

            Will create any needed parent directories automatically.

            If remote_path ends with `/` it's assumed to be a directory and the
            file will be uploaded with its current name to that directory.
            """
            ...

    write_file: __write_file_spec

    class __read_file_spec(typing_extensions.Protocol):
        def __call__(self, /, path: str) -> typing.Iterator[bytes]:
            """Read a file from the network file system"""
            ...

        def aio(self, /, path: str) -> collections.abc.AsyncIterator[bytes]:
            """Read a file from the network file system"""
            ...

    read_file: __read_file_spec

    class __iterdir_spec(typing_extensions.Protocol):
        def __call__(self, /, path: str) -> typing.Iterator[modal.volume.FileEntry]:
            """Iterate over all files in a directory in the network file system.

            * Passing a directory path lists all files in the directory (names are relative to the directory)
            * Passing a file path returns a list containing only that file's listing description
            * Passing a glob path (including at least one * or ** sequence) returns all files matching
            that glob path (using absolute paths)
            """
            ...

        def aio(self, /, path: str) -> collections.abc.AsyncIterator[modal.volume.FileEntry]:
            """Iterate over all files in a directory in the network file system.

            * Passing a directory path lists all files in the directory (names are relative to the directory)
            * Passing a file path returns a list containing only that file's listing description
            * Passing a glob path (including at least one * or ** sequence) returns all files matching
            that glob path (using absolute paths)
            """
            ...

    iterdir: __iterdir_spec

    class __add_local_file_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            local_path: typing.Union[pathlib.Path, str],
            remote_path: typing.Union[str, pathlib.PurePosixPath, None] = None,
            progress_cb: typing.Optional[collections.abc.Callable[..., typing.Any]] = None,
        ): ...
        async def aio(
            self,
            /,
            local_path: typing.Union[pathlib.Path, str],
            remote_path: typing.Union[str, pathlib.PurePosixPath, None] = None,
            progress_cb: typing.Optional[collections.abc.Callable[..., typing.Any]] = None,
        ): ...

    add_local_file: __add_local_file_spec

    class __add_local_dir_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            local_path: typing.Union[pathlib.Path, str],
            remote_path: typing.Union[str, pathlib.PurePosixPath, None] = None,
            progress_cb: typing.Optional[collections.abc.Callable[..., typing.Any]] = None,
        ): ...
        async def aio(
            self,
            /,
            local_path: typing.Union[pathlib.Path, str],
            remote_path: typing.Union[str, pathlib.PurePosixPath, None] = None,
            progress_cb: typing.Optional[collections.abc.Callable[..., typing.Any]] = None,
        ): ...

    add_local_dir: __add_local_dir_spec

    class __listdir_spec(typing_extensions.Protocol):
        def __call__(self, /, path: str) -> list[modal.volume.FileEntry]:
            """List all files in a directory in the network file system.

            * Passing a directory path lists all files in the directory (names are relative to the directory)
            * Passing a file path returns a list containing only that file's listing description
            * Passing a glob path (including at least one * or ** sequence) returns all files matching
            that glob path (using absolute paths)
            """
            ...

        async def aio(self, /, path: str) -> list[modal.volume.FileEntry]:
            """List all files in a directory in the network file system.

            * Passing a directory path lists all files in the directory (names are relative to the directory)
            * Passing a file path returns a list containing only that file's listing description
            * Passing a glob path (including at least one * or ** sequence) returns all files matching
            that glob path (using absolute paths)
            """
            ...

    listdir: __listdir_spec

    class __remove_file_spec(typing_extensions.Protocol):
        def __call__(self, /, path: str, recursive=False):
            """Remove a file in a network file system."""
            ...

        async def aio(self, /, path: str, recursive=False):
            """Remove a file in a network file system."""
            ...

    remove_file: __remove_file_spec
