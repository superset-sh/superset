import collections.abc
import google.protobuf.message
import modal._load_context
import modal._object
import modal._resolver
import modal._utils.blob_utils
import modal.client
import modal.file_pattern_matcher
import modal.object
import modal_proto.api_pb2
import pathlib
import typing
import typing_extensions

def client_mount_name() -> str:
    """Get the deployed name of the client package mount."""
    ...

def python_standalone_mount_name(version: str) -> str:
    """Get the deployed name of the python-build-standalone mount."""
    ...

class _MountEntry:
    def description(self) -> str: ...
    def get_files_to_upload(self) -> typing.Iterator[tuple[pathlib.Path, str]]: ...
    def watch_entry(self) -> tuple[pathlib.Path, pathlib.Path]: ...
    def top_level_paths(self) -> list[tuple[pathlib.Path, pathlib.PurePosixPath]]: ...

def _select_files(entries: list[_MountEntry]) -> list[tuple[pathlib.Path, pathlib.PurePosixPath]]: ...

class _MountFile(_MountEntry):
    """_MountFile(local_file: pathlib.Path, remote_path: pathlib.PurePosixPath)"""

    local_file: pathlib.Path
    remote_path: pathlib.PurePosixPath

    def description(self) -> str: ...
    def get_files_to_upload(self): ...
    def watch_entry(self): ...
    def top_level_paths(self) -> list[tuple[pathlib.Path, pathlib.PurePosixPath]]: ...
    def __init__(self, local_file: pathlib.Path, remote_path: pathlib.PurePosixPath) -> None:
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def __repr__(self):
        """Return repr(self)."""
        ...

    def __eq__(self, other):
        """Return self==value."""
        ...

class _MountDir(_MountEntry):
    """_MountDir(local_dir: pathlib.Path, remote_path: pathlib.PurePosixPath, ignore: Union[Callable[[pathlib.Path], bool], modal.file_pattern_matcher._AbstractPatternMatcher], recursive: bool)"""

    local_dir: pathlib.Path
    remote_path: pathlib.PurePosixPath
    ignore: typing.Union[
        collections.abc.Callable[[pathlib.Path], bool], modal.file_pattern_matcher._AbstractPatternMatcher
    ]
    recursive: bool

    def description(self): ...
    def _walk_and_prune(self, top_dir: pathlib.Path) -> collections.abc.Generator[str, None, None]:
        """Walk directories and prune ignored directories early."""
        ...

    def _walk_all(self, top_dir: pathlib.Path) -> collections.abc.Generator[str, None, None]:
        """Walk all directories without early pruning - safe for complex/inverted ignore patterns."""
        ...

    def get_files_to_upload(self): ...
    def watch_entry(self): ...
    def top_level_paths(self) -> list[tuple[pathlib.Path, pathlib.PurePosixPath]]: ...
    def __init__(
        self,
        local_dir: pathlib.Path,
        remote_path: pathlib.PurePosixPath,
        ignore: typing.Union[
            collections.abc.Callable[[pathlib.Path], bool], modal.file_pattern_matcher._AbstractPatternMatcher
        ],
        recursive: bool,
    ) -> None:
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def __repr__(self):
        """Return repr(self)."""
        ...

    def __eq__(self, other):
        """Return self==value."""
        ...

def module_mount_condition(module_base: pathlib.Path): ...
def module_mount_ignore_condition(module_base: pathlib.Path): ...

class _MountedPythonModule(_MountEntry):
    """_MountedPythonModule(module_name: str, remote_dir: Union[pathlib.PurePosixPath, str] = '/root', ignore: Optional[Callable[[pathlib.Path], bool]] = None)"""

    module_name: str
    remote_dir: typing.Union[pathlib.PurePosixPath, str]
    ignore: typing.Optional[collections.abc.Callable[[pathlib.Path], bool]]

    def description(self) -> str: ...
    def _proxy_entries(self) -> list[_MountEntry]: ...
    def get_files_to_upload(self) -> typing.Iterator[tuple[pathlib.Path, str]]: ...
    def watch_entry(self) -> tuple[pathlib.Path, pathlib.Path]: ...
    def top_level_paths(self) -> list[tuple[pathlib.Path, pathlib.PurePosixPath]]: ...
    def __init__(
        self,
        module_name: str,
        remote_dir: typing.Union[pathlib.PurePosixPath, str] = "/root",
        ignore: typing.Optional[collections.abc.Callable[[pathlib.Path], bool]] = None,
    ) -> None:
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def __repr__(self):
        """Return repr(self)."""
        ...

    def __eq__(self, other):
        """Return self==value."""
        ...

class NonLocalMountError(Exception):
    """Common base class for all non-exit exceptions."""

    ...

class _Mount(modal._object._Object):
    """**Deprecated**: Mounts should not be used explicitly anymore, use `Image.add_local_*` commands instead.

    Create a mount for a local directory or file that can be attached
    to one or more Modal functions.

    **Usage**

    ```python notest
    import modal
    import os
    app = modal.App()

    @app.function(mounts=[modal.Mount.from_local_dir("~/foo", remote_path="/root/foo")])
    def f():
        # `/root/foo` has the contents of `~/foo`.
        print(os.listdir("/root/foo/"))
    ```

    Modal syncs the contents of the local directory every time the app runs, but uses the hash of
    the file's contents to skip uploading files that have been uploaded before.
    """

    _entries: typing.Optional[list[_MountEntry]]
    _deployment_name: typing.Optional[str]
    _namespace: typing.Optional[int]
    _allow_overwrite: bool
    _content_checksum_sha256_hex: typing.Optional[str]

    @staticmethod
    def _new(entries: list[_MountEntry] = []) -> _Mount: ...
    def _extend(self, entry: _MountEntry) -> _Mount: ...
    @property
    def entries(self):
        """mdmd:hidden"""
        ...

    def _hydrate_metadata(self, handle_metadata: typing.Optional[google.protobuf.message.Message]): ...
    def _top_level_paths(self) -> list[tuple[pathlib.Path, pathlib.PurePosixPath]]: ...
    def is_local(self) -> bool:
        """mdmd:hidden"""
        ...

    @staticmethod
    def _add_local_dir(
        local_path: pathlib.Path,
        remote_path: pathlib.PurePosixPath,
        ignore: collections.abc.Callable[[pathlib.Path], bool] = modal.file_pattern_matcher._NOTHING,
    ): ...
    def add_local_dir(
        self,
        local_path: typing.Union[str, pathlib.Path],
        *,
        remote_path: typing.Union[str, pathlib.PurePosixPath, None] = None,
        condition: typing.Optional[collections.abc.Callable[[str], bool]] = None,
        recursive: bool = True,
    ) -> _Mount:
        """Add a local directory to the `Mount` object."""
        ...

    @staticmethod
    def _from_local_dir(
        local_path: typing.Union[str, pathlib.Path],
        *,
        remote_path: typing.Union[str, pathlib.PurePosixPath, None] = None,
        condition: typing.Optional[collections.abc.Callable[[str], bool]] = None,
        recursive: bool = True,
    ) -> _Mount: ...
    def add_local_file(
        self,
        local_path: typing.Union[str, pathlib.Path],
        remote_path: typing.Union[str, pathlib.PurePosixPath, None] = None,
    ) -> _Mount:
        """Add a local file to the `Mount` object."""
        ...

    @staticmethod
    def _from_local_file(
        local_path: typing.Union[str, pathlib.Path], remote_path: typing.Union[str, pathlib.PurePosixPath, None] = None
    ) -> _Mount: ...
    @staticmethod
    def _description(entries: list[_MountEntry]) -> str: ...
    @staticmethod
    def _get_files(
        entries: list[_MountEntry],
    ) -> collections.abc.AsyncGenerator[modal._utils.blob_utils.FileUploadSpec, None]: ...
    async def _load_mount(
        self: _Mount,
        resolver: modal._resolver.Resolver,
        load_context: modal._load_context.LoadContext,
        existing_object_id: typing.Optional[str],
    ): ...
    @staticmethod
    def _from_local_python_packages(
        *module_names: str,
        remote_dir: typing.Union[str, pathlib.PurePosixPath] = "/root",
        condition: typing.Optional[collections.abc.Callable[[str], bool]] = None,
        ignore: typing.Union[typing.Sequence[str], collections.abc.Callable[[pathlib.Path], bool], None] = None,
    ) -> _Mount: ...
    @staticmethod
    def from_name(
        name: str,
        *,
        namespace=1,
        environment_name: typing.Optional[str] = None,
        client: typing.Optional[modal.client._Client] = None,
    ) -> _Mount:
        """mdmd:hidden"""
        ...

    async def _deploy(
        self: _Mount,
        deployment_name: typing.Optional[str] = None,
        namespace=1,
        *,
        environment_name: typing.Optional[str] = None,
        allow_overwrite: bool = False,
        client: typing.Optional[modal.client._Client] = None,
    ) -> None: ...
    def _get_metadata(self) -> modal_proto.api_pb2.MountHandleMetadata: ...

class Mount(modal.object.Object):
    """**Deprecated**: Mounts should not be used explicitly anymore, use `Image.add_local_*` commands instead.

    Create a mount for a local directory or file that can be attached
    to one or more Modal functions.

    **Usage**

    ```python notest
    import modal
    import os
    app = modal.App()

    @app.function(mounts=[modal.Mount.from_local_dir("~/foo", remote_path="/root/foo")])
    def f():
        # `/root/foo` has the contents of `~/foo`.
        print(os.listdir("/root/foo/"))
    ```

    Modal syncs the contents of the local directory every time the app runs, but uses the hash of
    the file's contents to skip uploading files that have been uploaded before.
    """

    _entries: typing.Optional[list[_MountEntry]]
    _deployment_name: typing.Optional[str]
    _namespace: typing.Optional[int]
    _allow_overwrite: bool
    _content_checksum_sha256_hex: typing.Optional[str]

    def __init__(self, *args, **kwargs):
        """mdmd:hidden"""
        ...

    @staticmethod
    def _new(entries: list[_MountEntry] = []) -> Mount: ...
    def _extend(self, entry: _MountEntry) -> Mount: ...
    @property
    def entries(self):
        """mdmd:hidden"""
        ...

    def _hydrate_metadata(self, handle_metadata: typing.Optional[google.protobuf.message.Message]): ...
    def _top_level_paths(self) -> list[tuple[pathlib.Path, pathlib.PurePosixPath]]: ...
    def is_local(self) -> bool:
        """mdmd:hidden"""
        ...

    @staticmethod
    def _add_local_dir(
        local_path: pathlib.Path,
        remote_path: pathlib.PurePosixPath,
        ignore: collections.abc.Callable[[pathlib.Path], bool] = modal.file_pattern_matcher._NOTHING,
    ): ...
    def add_local_dir(
        self,
        local_path: typing.Union[str, pathlib.Path],
        *,
        remote_path: typing.Union[str, pathlib.PurePosixPath, None] = None,
        condition: typing.Optional[collections.abc.Callable[[str], bool]] = None,
        recursive: bool = True,
    ) -> Mount:
        """Add a local directory to the `Mount` object."""
        ...

    @staticmethod
    def _from_local_dir(
        local_path: typing.Union[str, pathlib.Path],
        *,
        remote_path: typing.Union[str, pathlib.PurePosixPath, None] = None,
        condition: typing.Optional[collections.abc.Callable[[str], bool]] = None,
        recursive: bool = True,
    ) -> Mount: ...
    def add_local_file(
        self,
        local_path: typing.Union[str, pathlib.Path],
        remote_path: typing.Union[str, pathlib.PurePosixPath, None] = None,
    ) -> Mount:
        """Add a local file to the `Mount` object."""
        ...

    @staticmethod
    def _from_local_file(
        local_path: typing.Union[str, pathlib.Path], remote_path: typing.Union[str, pathlib.PurePosixPath, None] = None
    ) -> Mount: ...
    @staticmethod
    def _description(entries: list[_MountEntry]) -> str: ...

    class ___get_files_spec(typing_extensions.Protocol):
        def __call__(
            self, /, entries: list[_MountEntry]
        ) -> typing.Generator[modal._utils.blob_utils.FileUploadSpec, None, None]: ...
        def aio(
            self, /, entries: list[_MountEntry]
        ) -> collections.abc.AsyncGenerator[modal._utils.blob_utils.FileUploadSpec, None]: ...

    _get_files: typing.ClassVar[___get_files_spec]

    class ___load_mount_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            resolver: modal._resolver.Resolver,
            load_context: modal._load_context.LoadContext,
            existing_object_id: typing.Optional[str],
        ): ...
        async def aio(
            self,
            /,
            resolver: modal._resolver.Resolver,
            load_context: modal._load_context.LoadContext,
            existing_object_id: typing.Optional[str],
        ): ...

    _load_mount: ___load_mount_spec

    @staticmethod
    def _from_local_python_packages(
        *module_names: str,
        remote_dir: typing.Union[str, pathlib.PurePosixPath] = "/root",
        condition: typing.Optional[collections.abc.Callable[[str], bool]] = None,
        ignore: typing.Union[typing.Sequence[str], collections.abc.Callable[[pathlib.Path], bool], None] = None,
    ) -> Mount: ...
    @staticmethod
    def from_name(
        name: str,
        *,
        namespace=1,
        environment_name: typing.Optional[str] = None,
        client: typing.Optional[modal.client.Client] = None,
    ) -> Mount:
        """mdmd:hidden"""
        ...

    class ___deploy_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            deployment_name: typing.Optional[str] = None,
            namespace=1,
            *,
            environment_name: typing.Optional[str] = None,
            allow_overwrite: bool = False,
            client: typing.Optional[modal.client.Client] = None,
        ) -> None: ...
        async def aio(
            self,
            /,
            deployment_name: typing.Optional[str] = None,
            namespace=1,
            *,
            environment_name: typing.Optional[str] = None,
            allow_overwrite: bool = False,
            client: typing.Optional[modal.client.Client] = None,
        ) -> None: ...

    _deploy: ___deploy_spec

    def _get_metadata(self) -> modal_proto.api_pb2.MountHandleMetadata: ...

def _create_client_mount(): ...
def create_client_mount(): ...
def _get_client_mount(): ...
def _is_modal_path(remote_path: pathlib.PurePosixPath): ...
async def _create_single_client_dependency_mount(
    client: modal.client._Client,
    builder_version: str,
    python_version: str,
    arch: str,
    platform: str,
    uv_python_platform: str,
    check_if_exists: bool = True,
    allow_overwrite: bool = False,
    dry_run: bool = False,
): ...
async def _create_client_dependency_mounts(
    client=None,
    python_versions: list[str] = ["3.10", "3.11", "3.12", "3.13", "3.14", "3.14t"],
    builder_versions: list[str] = ["2025.06"],
    check_if_exists=True,
    dry_run=False,
): ...

class __create_client_dependency_mounts_spec(typing_extensions.Protocol):
    def __call__(
        self,
        /,
        client=None,
        python_versions: list[str] = ["3.10", "3.11", "3.12", "3.13", "3.14", "3.14t"],
        builder_versions: list[str] = ["2025.06"],
        check_if_exists=True,
        dry_run=False,
    ): ...
    async def aio(
        self,
        /,
        client=None,
        python_versions: list[str] = ["3.10", "3.11", "3.12", "3.13", "3.14", "3.14t"],
        builder_versions: list[str] = ["2025.06"],
        check_if_exists=True,
        dry_run=False,
    ): ...

create_client_dependency_mounts: __create_client_dependency_mounts_spec

ROOT_DIR: pathlib.PurePosixPath

PYTHON_STANDALONE_VERSIONS: dict[str, tuple[str, str]]
