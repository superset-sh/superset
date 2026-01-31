import collections.abc
import google.protobuf.message
import modal._functions
import modal._object
import modal.app
import modal.client
import modal.cloud_bucket_mount
import modal.functions
import modal.gpu
import modal.mount
import modal.network_file_system
import modal.object
import modal.secret
import modal.volume
import modal_proto.api_pb2
import pathlib
import typing
import typing_extensions

ImageBuilderVersion = typing.Literal["2023.12", "2024.04", "2024.10", "2025.06", "PREVIEW"]

class _AutoDockerIgnoreSentinel:
    def __repr__(self) -> str:
        """Return repr(self)."""
        ...

    def __call__(self, _: pathlib.Path) -> bool:
        """Call self as a function."""
        ...

AUTO_DOCKERIGNORE: _AutoDockerIgnoreSentinel

def _validate_python_version(
    python_version: typing.Optional[str],
    builder_version: typing.Literal["2023.12", "2024.04", "2024.10", "2025.06", "PREVIEW"],
    allow_micro_granularity: bool = True,
    allow_free_threading: bool = False,
    caller_name: str = "",
) -> str: ...
def _dockerhub_python_version(
    builder_version: typing.Literal["2023.12", "2024.04", "2024.10", "2025.06", "PREVIEW"],
    python_version: typing.Optional[str] = None,
    allow_free_threading: bool = False,
    caller_name: str = "",
) -> str: ...
def _base_image_config(
    group: str, builder_version: typing.Literal["2023.12", "2024.04", "2024.10", "2025.06", "PREVIEW"]
) -> typing.Any: ...
def _get_modal_requirements_path(
    builder_version: typing.Literal["2023.12", "2024.04", "2024.10", "2025.06", "PREVIEW"],
    python_version: typing.Optional[str] = None,
) -> str: ...
def _get_modal_requirements_command(
    version: typing.Literal["2023.12", "2024.04", "2024.10", "2025.06", "PREVIEW"],
) -> str: ...
def _flatten_str_args(
    function_name: str, arg_name: str, args: collections.abc.Sequence[typing.Union[str, list[str]]]
) -> list[str]:
    """Takes a sequence of strings, or string lists, and flattens it.

    Raises an error if any of the elements are not strings or string lists.
    """
    ...

def _validate_packages(packages: list[str]) -> bool:
    """Validates that a list of packages does not contain any command-line options."""
    ...

def _make_pip_install_args(
    find_links: typing.Optional[str] = None,
    index_url: typing.Optional[str] = None,
    extra_index_url: typing.Optional[str] = None,
    pre: bool = False,
    extra_options: str = "",
) -> str: ...
def _get_image_builder_version(
    server_version: typing.Literal["2023.12", "2024.04", "2024.10", "2025.06", "PREVIEW"],
) -> typing.Literal["2023.12", "2024.04", "2024.10", "2025.06", "PREVIEW"]: ...
def _create_context_mount(
    docker_commands: collections.abc.Sequence[str],
    ignore_fn: collections.abc.Callable[[pathlib.Path], bool],
    context_dir: pathlib.Path,
) -> typing.Optional[modal.mount._Mount]:
    """Creates a context mount from a list of docker commands.

    1. Paths are evaluated relative to context_dir.
    2. First selects inclusions based on COPY commands in the list of commands.
    3. Then ignore any files as per the ignore predicate.
    """
    ...

def _create_context_mount_function(
    ignore: typing.Union[
        collections.abc.Sequence[str], collections.abc.Callable[[pathlib.Path], bool], _AutoDockerIgnoreSentinel
    ],
    dockerfile_cmds: list[str] = [],
    dockerfile_path: typing.Optional[pathlib.Path] = None,
    context_dir: typing.Union[str, pathlib.Path, None] = None,
): ...

class _ImageRegistryConfig:
    """mdmd:hidden"""
    def __init__(self, registry_auth_type: int = 0, secret: typing.Optional[modal.secret._Secret] = None):
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def get_proto(self) -> modal_proto.api_pb2.ImageRegistryConfig: ...

class DockerfileSpec:
    """DockerfileSpec(commands: list[str], context_files: dict[str, str])"""

    commands: list[str]
    context_files: dict[str, str]

    def __init__(self, commands: list[str], context_files: dict[str, str]) -> None:
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def __repr__(self):
        """Return repr(self)."""
        ...

    def __eq__(self, other):
        """Return self==value."""
        ...

async def _image_await_build_result(
    image_id: str, client: modal.client._Client
) -> modal_proto.api_pb2.ImageJoinStreamingResponse: ...

SUPERSELF = typing.TypeVar("SUPERSELF", covariant=True)

class _Image(modal._object._Object):
    """Base class for container images to run functions in.

    Do not construct this class directly; instead use one of its static factory methods,
    such as `modal.Image.debian_slim`, `modal.Image.from_registry`, or `modal.Image.micromamba`.
    """

    force_build: bool
    inside_exceptions: list[Exception]
    _serve_mounts: frozenset[modal.mount._Mount]
    _deferred_mounts: collections.abc.Sequence[modal.mount._Mount]
    _added_python_source_set: frozenset[str]
    _metadata: typing.Optional[modal_proto.api_pb2.ImageMetadata]

    def _initialize_from_empty(self): ...
    def _initialize_from_other(self, other: _Image): ...
    def _get_metadata(self) -> typing.Optional[google.protobuf.message.Message]: ...
    def _hydrate_metadata(self, metadata: typing.Optional[google.protobuf.message.Message]): ...
    def _add_mount_layer_or_copy(self, mount: modal.mount._Mount, copy: bool = False): ...
    @property
    def _mount_layers(self) -> typing.Sequence[modal.mount._Mount]:
        """Non-evaluated mount layers on the image

        When the image is used by a Modal container, these mounts need to be attached as well to
        represent the full image content, as they haven't yet been represented as a layer in the
        image.

        When the image is used as a base image for a new layer (that is not itself a mount layer)
        these mounts need to first be inserted as a copy operation (.copy_mount) into the image.
        """
        ...

    def _assert_no_mount_layers(self): ...
    @staticmethod
    def _from_args(
        *,
        base_images: typing.Optional[dict[str, _Image]] = None,
        dockerfile_function: typing.Optional[
            collections.abc.Callable[
                [typing.Literal["2023.12", "2024.04", "2024.10", "2025.06", "PREVIEW"]], DockerfileSpec
            ]
        ] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret._Secret]] = None,
        gpu_config: typing.Optional[modal_proto.api_pb2.GPUConfig] = None,
        build_function: typing.Optional[modal._functions._Function] = None,
        build_function_input: typing.Optional[modal_proto.api_pb2.FunctionInput] = None,
        image_registry_config: typing.Optional[_ImageRegistryConfig] = None,
        context_mount_function: typing.Optional[
            collections.abc.Callable[[], typing.Optional[modal.mount._Mount]]
        ] = None,
        force_build: bool = False,
        build_args: dict[str, str] = {},
        validated_volumes: typing.Optional[collections.abc.Sequence[tuple[str, modal.volume._Volume]]] = None,
        _namespace: int = 1,
        _do_assert_no_mount_layers: bool = True,
    ): ...
    def _copy_mount(self, mount: modal.mount._Mount, remote_path: typing.Union[str, pathlib.Path] = ".") -> _Image:
        """mdmd:hidden
        Internal
        """
        ...

    def add_local_file(
        self, local_path: typing.Union[str, pathlib.Path], remote_path: str, *, copy: bool = False
    ) -> _Image:
        """Adds a local file to the image at `remote_path` within the container

        By default (`copy=False`), the files are added to containers on startup and are not built into the actual Image,
        which speeds up deployment.

        Set `copy=True` to copy the files into an Image layer at build time instead, similar to how
        [`COPY`](https://docs.docker.com/engine/reference/builder/#copy) works in a `Dockerfile`.

        copy=True can slow down iteration since it requires a rebuild of the Image and any subsequent
        build steps whenever the included files change, but it is required if you want to run additional
        build steps after this one.

        *Added in v0.66.40*: This method replaces the deprecated `modal.Image.copy_local_file` method.
        """
        ...

    def add_local_dir(
        self,
        local_path: typing.Union[str, pathlib.Path],
        remote_path: str,
        *,
        copy: bool = False,
        ignore: typing.Union[collections.abc.Sequence[str], collections.abc.Callable[[pathlib.Path], bool]] = [],
    ) -> _Image:
        """Adds a local directory's content to the image at `remote_path` within the container

        By default (`copy=False`), the files are added to containers on startup and are not built into the actual Image,
        which speeds up deployment.

        Set `copy=True` to copy the files into an Image layer at build time instead, similar to how
        [`COPY`](https://docs.docker.com/engine/reference/builder/#copy) works in a `Dockerfile`.

        copy=True can slow down iteration since it requires a rebuild of the Image and any subsequent
        build steps whenever the included files change, but it is required if you want to run additional
        build steps after this one.

        **Usage:**

        ```python
        from modal import FilePatternMatcher

        image = modal.Image.debian_slim().add_local_dir(
            "~/assets",
            remote_path="/assets",
            ignore=["*.venv"],
        )

        image = modal.Image.debian_slim().add_local_dir(
            "~/assets",
            remote_path="/assets",
            ignore=lambda p: p.is_relative_to(".venv"),
        )

        image = modal.Image.debian_slim().add_local_dir(
            "~/assets",
            remote_path="/assets",
            ignore=FilePatternMatcher("**/*.txt"),
        )

        # When including files is simpler than excluding them, you can use the `~` operator to invert the matcher.
        image = modal.Image.debian_slim().add_local_dir(
            "~/assets",
            remote_path="/assets",
            ignore=~FilePatternMatcher("**/*.py"),
        )

        # You can also read ignore patterns from a file.
        image = modal.Image.debian_slim().add_local_dir(
            "~/assets",
            remote_path="/assets",
            ignore=FilePatternMatcher.from_file("/path/to/ignorefile"),
        )
        ```

        *Added in v0.66.40*: This method replaces the deprecated `modal.Image.copy_local_dir` method.
        """
        ...

    def add_local_python_source(
        self,
        *module_names: str,
        copy: bool = False,
        ignore: typing.Union[
            collections.abc.Sequence[str], collections.abc.Callable[[pathlib.Path], bool]
        ] = modal.file_pattern_matcher.NON_PYTHON_FILES,
    ) -> _Image:
        """Adds locally available Python packages/modules to containers

        Adds all files from the specified Python package or module to containers running the Image.

        Packages are added to the `/root` directory of containers, which is on the `PYTHONPATH`
        of any executed Modal Functions, enabling import of the module by that name.

        By default (`copy=False`), the files are added to containers on startup and are not built into the actual Image,
        which speeds up deployment.

        Set `copy=True` to copy the files into an Image layer at build time instead. This can slow down iteration since
        it requires a rebuild of the Image and any subsequent build steps whenever the included files change, but it is
        required if you want to run additional build steps after this one.

        **Note:** This excludes all dot-prefixed subdirectories or files and all `.pyc`/`__pycache__` files.
        To add full directories with finer control, use `.add_local_dir()` instead and specify `/root` as
        the destination directory.

        By default only includes `.py`-files in the source modules. Set the `ignore` argument to a list of patterns
        or a callable to override this behavior, e.g.:

        ```py
        # includes everything except data.json
        modal.Image.debian_slim().add_local_python_source("mymodule", ignore=["data.json"])

        # exclude large files
        modal.Image.debian_slim().add_local_python_source(
            "mymodule",
            ignore=lambda p: p.stat().st_size > 1e9
        )
        ```

        *Added in v0.67.28*: This method replaces the deprecated `modal.Mount.from_local_python_packages` pattern.
        """
        ...

    class __from_id_spec(typing_extensions.Protocol[SUPERSELF]):
        def __call__(self, /, image_id: str, client: typing.Optional[modal.client.Client] = None) -> SUPERSELF:
            """Construct an Image from an id and look up the Image result.

            The ID of an Image object can be accessed using `.object_id`.
            """
            ...

        async def aio(self, /, image_id: str, client: typing.Optional[modal.client.Client] = None): ...

    from_id: typing.ClassVar[__from_id_spec[typing_extensions.Self]]

    async def build(self, app: modal.app._App) -> _Image:
        """Eagerly build an image.

        If your image was previously built, then this method will not rebuild your image
        and your cached image is returned.

        **Examples**

        ```python
        image = modal.Image.debian_slim().uv_pip_install("scipy", "numpy")

        app = modal.App.lookup("build-image", create_if_missing=True)
        with modal.enable_output():  # To see logs in your local terminal
            image.build(app)

        # Save the image id
        my_image_id = image.object_id

        # Reference the image with the id or uses it another context.
        built_image = modal.Image.from_id(my_image_id)
        ```

        Alternatively, you can pre-build a image and use it in a sandbox.

        ```python notest
        app = modal.App.lookup("sandbox-example", create_if_missing=True)

        with modal.enable_output():
            image = modal.Image.debian_slim().uv_pip_install("scipy")
            image.build(app)

        sb = modal.Sandbox.create("python", "-c", "import scipy; print(scipy)", app=app, image=image)
        print(sb.stdout.read())
        sb.terminate()
        ```

        **Note**

        For defining Modal functions, images are built automatically when deploying or running an App.
        You do not need to built the image explicitly:

        ```python notest
        app = modal.App()
        image = modal.Image.debian_slim()

        # No need to explicitly build the image for defining a function.
        @app.function(image=image)
        def f():
            ...
        ```
        """
        ...

    def pip_install(
        self,
        *packages: typing.Union[str, list[str]],
        find_links: typing.Optional[str] = None,
        index_url: typing.Optional[str] = None,
        extra_index_url: typing.Optional[str] = None,
        pre: bool = False,
        extra_options: str = "",
        force_build: bool = False,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret._Secret]] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
    ) -> _Image:
        """Install a list of Python packages using pip.

        **Examples**

        Simple installation:
        ```python
        image = modal.Image.debian_slim().pip_install("click", "httpx~=0.23.3")
        ```

        More complex installation:
        ```python
        image = (
            modal.Image.from_registry(
                "nvidia/cuda:12.2.0-devel-ubuntu22.04", add_python="3.11"
            )
            .pip_install(
                "ninja",
                "packaging",
                "wheel",
                "transformers==4.40.2",
            )
            .pip_install(
                "flash-attn==2.5.8", extra_options="--no-build-isolation"
            )
        )
        ```
        """
        ...

    def pip_install_private_repos(
        self,
        *repositories: str,
        git_user: str,
        find_links: typing.Optional[str] = None,
        index_url: typing.Optional[str] = None,
        extra_index_url: typing.Optional[str] = None,
        pre: bool = False,
        extra_options: str = "",
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret._Secret]] = None,
        force_build: bool = False,
    ) -> _Image:
        """Install a list of Python packages from private git repositories using pip.

        This method currently supports Github and Gitlab only.

        - **Github:** Provide a `modal.Secret` that contains a `GITHUB_TOKEN` key-value pair
        - **Gitlab:** Provide a `modal.Secret` that contains a `GITLAB_TOKEN` key-value pair

        These API tokens should have permissions to read the list of private repositories provided as arguments.

        We recommend using Github's ['fine-grained' access tokens](https://github.blog/2022-10-18-introducing-fine-grained-personal-access-tokens-for-github/).
        These tokens are repo-scoped, and avoid granting read permission across all of a user's private repos.

        **Example**

        ```python
        image = (
            modal.Image
            .debian_slim()
            .pip_install_private_repos(
                "github.com/ecorp/private-one@1.0.0",
                "github.com/ecorp/private-two@main"
                "github.com/ecorp/private-three@d4776502"
                # install from 'inner' directory on default branch.
                "github.com/ecorp/private-four#subdirectory=inner",
                git_user="erikbern",
                secrets=[modal.Secret.from_name("github-read-private")],
            )
        )
        ```
        """
        ...

    def pip_install_from_requirements(
        self,
        requirements_txt: str,
        find_links: typing.Optional[str] = None,
        *,
        index_url: typing.Optional[str] = None,
        extra_index_url: typing.Optional[str] = None,
        pre: bool = False,
        extra_options: str = "",
        force_build: bool = False,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret._Secret]] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
    ) -> _Image:
        """Install a list of Python packages from a local `requirements.txt` file."""
        ...

    def pip_install_from_pyproject(
        self,
        pyproject_toml: str,
        optional_dependencies: list[str] = [],
        *,
        find_links: typing.Optional[str] = None,
        index_url: typing.Optional[str] = None,
        extra_index_url: typing.Optional[str] = None,
        pre: bool = False,
        extra_options: str = "",
        force_build: bool = False,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret._Secret]] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
    ) -> _Image:
        """Install dependencies specified by a local `pyproject.toml` file.

        `optional_dependencies` is a list of the keys of the
        optional-dependencies section(s) of the `pyproject.toml` file
        (e.g. test, doc, experiment, etc). When provided,
        all of the packages in each listed section are installed as well.
        """
        ...

    def uv_pip_install(
        self,
        *packages: typing.Union[str, list[str]],
        requirements: typing.Optional[list[str]] = None,
        find_links: typing.Optional[str] = None,
        index_url: typing.Optional[str] = None,
        extra_index_url: typing.Optional[str] = None,
        pre: bool = False,
        extra_options: str = "",
        force_build: bool = False,
        uv_version: typing.Optional[str] = None,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret._Secret]] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
    ) -> _Image:
        """Install a list of Python packages using uv pip install.

        **Examples**

        Simple installation:
        ```python
        image = modal.Image.debian_slim().uv_pip_install("torch==2.7.1", "numpy")
        ```

        This method assumes that:
        - Python is on the `$PATH` and dependencies are installed with the first Python on the `$PATH`.
        - Shell supports backticks for substitution
        - `which` command is on the `$PATH`

        Added in v1.1.0.
        """
        ...

    def poetry_install_from_file(
        self,
        poetry_pyproject_toml: str,
        poetry_lockfile: typing.Optional[str] = None,
        *,
        ignore_lockfile: bool = False,
        force_build: bool = False,
        with_: list[str] = [],
        without: list[str] = [],
        only: list[str] = [],
        poetry_version: typing.Optional[str] = "latest",
        old_installer: bool = False,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret._Secret]] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
    ) -> _Image:
        """Install poetry *dependencies* specified by a local `pyproject.toml` file.

        If not provided as argument the path to the lockfile is inferred. However, the
        file has to exist, unless `ignore_lockfile` is set to `True`.

        Note that the root project of the poetry project is not installed, only the dependencies.
        For including local python source files see `add_local_python_source`

        Poetry will be installed to the Image (using pip) unless `poetry_version` is set to None.
        Note that the interpretation of `poetry_version="latest"` depends on the Modal Image Builder
        version, with versions 2024.10 and earlier limiting poetry to 1.x.
        """
        ...

    def uv_sync(
        self,
        uv_project_dir: str = "./",
        *,
        force_build: bool = False,
        groups: typing.Optional[list[str]] = None,
        extras: typing.Optional[list[str]] = None,
        frozen: bool = True,
        extra_options: str = "",
        uv_version: typing.Optional[str] = None,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret._Secret]] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
    ) -> _Image:
        """Creates a virtual environment with the dependencies in a uv managed project with `uv sync`.

        **Examples**
        ```python
        image = modal.Image.debian_slim().uv_sync()
        ```

        The `pyproject.toml` and `uv.lock` in `uv_project_dir` are automatically added to the build context. The
        `uv_project_dir` is relative to the current working directory of where `modal` is called.

        NOTE: This does *not* install the project itself into the environment (this is equivalent to the
        `--no-install-project` flag in the `uv sync` command) and you would be expected to add any local python source
        files using `Image.add_local_python_source` or similar methods after this call.

        This ensures that updates to your project code wouldn't require reinstalling third-party dependencies
        after every change.

        uv workspaces are currently not supported.

        Added in v1.1.0.
        """
        ...

    def dockerfile_commands(
        self,
        *dockerfile_commands: typing.Union[str, list[str]],
        context_files: dict[str, str] = {},
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret._Secret]] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
        context_dir: typing.Union[str, pathlib.Path, None] = None,
        force_build: bool = False,
        ignore: typing.Union[
            collections.abc.Sequence[str], collections.abc.Callable[[pathlib.Path], bool]
        ] = modal.image.AUTO_DOCKERIGNORE,
    ) -> _Image:
        """Extend an image with arbitrary Dockerfile-like commands.

        **Usage:**

        ```python
        from modal import FilePatternMatcher

        # By default a .dockerignore file is used if present in the current working directory
        image = modal.Image.debian_slim().dockerfile_commands(
            ["COPY data /data"],
        )

        image = modal.Image.debian_slim().dockerfile_commands(
            ["COPY data /data"],
            ignore=["*.venv"],
        )

        image = modal.Image.debian_slim().dockerfile_commands(
            ["COPY data /data"],
            ignore=lambda p: p.is_relative_to(".venv"),
        )

        image = modal.Image.debian_slim().dockerfile_commands(
            ["COPY data /data"],
            ignore=FilePatternMatcher("**/*.txt"),
        )

        # When including files is simpler than excluding them, you can use the `~` operator to invert the matcher.
        image = modal.Image.debian_slim().dockerfile_commands(
            ["COPY data /data"],
            ignore=~FilePatternMatcher("**/*.py"),
        )

        # You can also read ignore patterns from a file.
        image = modal.Image.debian_slim().dockerfile_commands(
            ["COPY data /data"],
            ignore=FilePatternMatcher.from_file("/path/to/dockerignore"),
        )
        ```
        """
        ...

    def entrypoint(self, entrypoint_commands: list[str]) -> _Image:
        """Set the ENTRYPOINT for the image."""
        ...

    def shell(self, shell_commands: list[str]) -> _Image:
        """Overwrite default shell for the image."""
        ...

    def run_commands(
        self,
        *commands: typing.Union[str, list[str]],
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret._Secret]] = None,
        volumes: typing.Optional[dict[typing.Union[str, pathlib.PurePosixPath], modal.volume._Volume]] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
        force_build: bool = False,
    ) -> _Image:
        """Extend an image with a list of shell commands to run."""
        ...

    @staticmethod
    def micromamba(python_version: typing.Optional[str] = None, force_build: bool = False) -> _Image:
        """A Micromamba base image. Micromamba allows for fast building of small Conda-based containers."""
        ...

    def micromamba_install(
        self,
        *packages: typing.Union[str, list[str]],
        spec_file: typing.Optional[str] = None,
        channels: list[str] = [],
        force_build: bool = False,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret._Secret]] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
    ) -> _Image:
        """Install a list of additional packages using micromamba."""
        ...

    @staticmethod
    def _registry_setup_commands(
        tag: str,
        builder_version: typing.Literal["2023.12", "2024.04", "2024.10", "2025.06", "PREVIEW"],
        setup_commands: list[str],
        add_python: typing.Optional[str] = None,
    ) -> list[str]: ...
    @staticmethod
    def from_registry(
        tag: str,
        secret: typing.Optional[modal.secret._Secret] = None,
        *,
        setup_dockerfile_commands: list[str] = [],
        force_build: bool = False,
        add_python: typing.Optional[str] = None,
        **kwargs,
    ) -> _Image:
        """Build a Modal Image from a public or private image registry, such as Docker Hub.

        The image must be built for the `linux/amd64` platform.

        If your image does not come with Python installed, you can use the `add_python` parameter
        to specify a version of Python to add to the image. Otherwise, the image is expected to
        have Python on PATH as `python`, along with `pip`.

        You may also use `setup_dockerfile_commands` to run Dockerfile commands before the
        remaining commands run. This might be useful if you want a custom Python installation or to
        set a `SHELL`. Prefer `run_commands()` when possible though.

        To authenticate against a private registry with static credentials, you must set the `secret` parameter to
        a `modal.Secret` containing a username (`REGISTRY_USERNAME`) and
        an access token or password (`REGISTRY_PASSWORD`).

        To authenticate against private registries with credentials from a cloud provider,
        use `Image.from_gcp_artifact_registry()` or `Image.from_aws_ecr()`.

        **Examples**

        ```python
        modal.Image.from_registry("python:3.11-slim-bookworm")
        modal.Image.from_registry("ubuntu:22.04", add_python="3.11")
        modal.Image.from_registry("nvcr.io/nvidia/pytorch:22.12-py3")
        ```
        """
        ...

    @staticmethod
    def from_gcp_artifact_registry(
        tag: str,
        secret: typing.Optional[modal.secret._Secret] = None,
        *,
        setup_dockerfile_commands: list[str] = [],
        force_build: bool = False,
        add_python: typing.Optional[str] = None,
        **kwargs,
    ) -> _Image:
        """Build a Modal image from a private image in Google Cloud Platform (GCP) Artifact Registry.

        You will need to pass a `modal.Secret` containing [your GCP service account key data](https://cloud.google.com/iam/docs/keys-create-delete#creating)
        as `SERVICE_ACCOUNT_JSON`. This can be done from the [Secrets](https://modal.com/secrets) page.
        Your service account should be granted a specific role depending on the GCP registry used:

        - For Artifact Registry images (`pkg.dev` domains) use
          the ["Artifact Registry Reader"](https://cloud.google.com/artifact-registry/docs/access-control#roles) role
        - For Container Registry images (`gcr.io` domains) use
          the ["Storage Object Viewer"](https://cloud.google.com/artifact-registry/docs/transition/setup-gcr-repo) role

        **Note:** This method does not use `GOOGLE_APPLICATION_CREDENTIALS` as that
        variable accepts a path to a JSON file, not the actual JSON string.

        See `Image.from_registry()` for information about the other parameters.

        **Example**

        ```python
        modal.Image.from_gcp_artifact_registry(
            "us-east1-docker.pkg.dev/my-project-1234/my-repo/my-image:my-version",
            secret=modal.Secret.from_name(
                "my-gcp-secret",
                required_keys=["SERVICE_ACCOUNT_JSON"],
            ),
            add_python="3.11",
        )
        ```
        """
        ...

    @staticmethod
    def from_aws_ecr(
        tag: str,
        secret: typing.Optional[modal.secret._Secret] = None,
        *,
        setup_dockerfile_commands: list[str] = [],
        force_build: bool = False,
        add_python: typing.Optional[str] = None,
        **kwargs,
    ) -> _Image:
        """Build a Modal image from a private image in AWS Elastic Container Registry (ECR).

        You will need to pass a `modal.Secret` containing either IAM user credentials or OIDC
        configuration to access the target ECR registry.

        For IAM user authentication, set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION`.

        For OIDC authentication, set `AWS_ROLE_ARN` and `AWS_REGION`.

        IAM configuration details can be found in the AWS documentation for
        ["Private repository policies"](https://docs.aws.amazon.com/AmazonECR/latest/userguide/repository-policies.html).

        For more details on using an AWS role to access ECR, see the [OIDC integration guide](https://modal.com/docs/guide/oidc-integration).

        See `Image.from_registry()` for information about the other parameters.

        **Example**

        ```python
        modal.Image.from_aws_ecr(
            "000000000000.dkr.ecr.us-east-1.amazonaws.com/my-private-registry:my-version",
            secret=modal.Secret.from_name(
                "aws",
                required_keys=["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
            ),
            add_python="3.11",
        )
        ```
        """
        ...

    @staticmethod
    def from_dockerfile(
        path: typing.Union[str, pathlib.Path],
        *,
        force_build: bool = False,
        context_dir: typing.Union[str, pathlib.Path, None] = None,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret._Secret]] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
        add_python: typing.Optional[str] = None,
        build_args: dict[str, str] = {},
        ignore: typing.Union[
            collections.abc.Sequence[str], collections.abc.Callable[[pathlib.Path], bool]
        ] = modal.image.AUTO_DOCKERIGNORE,
    ) -> _Image:
        """Build a Modal image from a local Dockerfile.

        If your Dockerfile does not have Python installed, you can use the `add_python` parameter
        to specify a version of Python to add to the image.

        **Usage:**

        ```python
        from modal import FilePatternMatcher

        # By default a .dockerignore file is used if present in the current working directory
        image = modal.Image.from_dockerfile(
            "./Dockerfile",
            add_python="3.12",
        )

        image = modal.Image.from_dockerfile(
            "./Dockerfile",
            add_python="3.12",
            ignore=["*.venv"],
        )

        image = modal.Image.from_dockerfile(
            "./Dockerfile",
            add_python="3.12",
            ignore=lambda p: p.is_relative_to(".venv"),
        )

        image = modal.Image.from_dockerfile(
            "./Dockerfile",
            add_python="3.12",
            ignore=FilePatternMatcher("**/*.txt"),
        )

        # When including files is simpler than excluding them, you can use the `~` operator to invert the matcher.
        image = modal.Image.from_dockerfile(
            "./Dockerfile",
            add_python="3.12",
            ignore=~FilePatternMatcher("**/*.py"),
        )

        # You can also read ignore patterns from a file.
        image = modal.Image.from_dockerfile(
            "./Dockerfile",
            add_python="3.12",
            ignore=FilePatternMatcher.from_file("/path/to/dockerignore"),
        )
        ```
        """
        ...

    @staticmethod
    def debian_slim(python_version: typing.Optional[str] = None, force_build: bool = False) -> _Image:
        """Default image, based on the official `python` Docker images."""
        ...

    def apt_install(
        self,
        *packages: typing.Union[str, list[str]],
        force_build: bool = False,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret._Secret]] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
    ) -> _Image:
        """Install a list of Debian packages using `apt`.

        **Example**

        ```python
        image = modal.Image.debian_slim().apt_install("git")
        ```
        """
        ...

    def run_function(
        self,
        raw_f: collections.abc.Callable[..., typing.Any],
        *,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret._Secret]] = None,
        volumes: dict[
            typing.Union[str, pathlib.PurePosixPath],
            typing.Union[modal.volume._Volume, modal.cloud_bucket_mount._CloudBucketMount],
        ] = {},
        network_file_systems: dict[
            typing.Union[str, pathlib.PurePosixPath], modal.network_file_system._NetworkFileSystem
        ] = {},
        gpu: typing.Union[None, str, modal.gpu._GPUConfig, list[typing.Union[None, str, modal.gpu._GPUConfig]]] = None,
        cpu: typing.Optional[float] = None,
        memory: typing.Optional[int] = None,
        timeout: int = 3600,
        cloud: typing.Optional[str] = None,
        region: typing.Union[str, collections.abc.Sequence[str], None] = None,
        force_build: bool = False,
        args: collections.abc.Sequence[typing.Any] = (),
        kwargs: dict[str, typing.Any] = {},
        include_source: bool = True,
    ) -> _Image:
        """Run user-defined function `raw_f` as an image build step.

        The function runs like an ordinary Modal Function, accepting a resource configuration and integrating
        with Modal features like Secrets and Volumes. Unlike ordinary Modal Functions, any changes to the
        filesystem state will be captured on container exit and saved as a new Image.

        **Note**

        Only the source code of `raw_f`, the contents of `**kwargs`, and any referenced *global* variables
        are used to determine whether the image has changed and needs to be rebuilt.
        If this function references other functions or variables, the image will not be rebuilt if you
        make changes to them. You can force a rebuild by changing the function's source code itself.

        **Example**

        ```python notest

        def my_build_function():
            open("model.pt", "w").write("parameters!")

        image = (
            modal.Image
                .debian_slim()
                .pip_install("torch")
                .run_function(my_build_function, secrets=[...], mounts=[...])
        )
        ```
        """
        ...

    def env(self, vars: dict[str, str]) -> _Image:
        """Sets the environment variables in an Image.

        **Example**

        ```python
        image = (
            modal.Image.debian_slim()
            .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
        )
        ```
        """
        ...

    def workdir(self, path: typing.Union[str, pathlib.PurePosixPath]) -> _Image:
        """Set the working directory for subsequent image build steps and function execution.

        **Example**

        ```python
        image = (
            modal.Image.debian_slim()
            .run_commands("git clone https://xyz app")
            .workdir("/app")
            .run_commands("yarn install")
        )
        ```
        """
        ...

    def cmd(self, cmd: list[str]) -> _Image:
        """Set the default command (`CMD`) to run when a container is started.

        Used with `modal.Sandbox`. Has no effect on `modal.Function`.

        **Example**

        ```python
        image = (
            modal.Image.debian_slim().cmd(["python", "app.py"])
        )
        ```
        """
        ...

    def imports(self):
        """Used to import packages in global scope that are only available when running remotely.
        By using this context manager you can avoid an `ImportError` due to not having certain
        packages installed locally.

        **Usage:**

        ```python notest
        with image.imports():
            import torch
        ```
        """
        ...

    def _logs(self) -> typing.AsyncGenerator[str, None]:
        """Streams logs from an image, or returns logs from an already completed image.

        This method is considered private since its interface may change - use it at your own risk!
        """
        ...

    async def hydrate(self, client: typing.Optional[modal.client._Client] = None) -> typing_extensions.Self:
        """mdmd:hidden"""
        ...

class Image(modal.object.Object):
    """Base class for container images to run functions in.

    Do not construct this class directly; instead use one of its static factory methods,
    such as `modal.Image.debian_slim`, `modal.Image.from_registry`, or `modal.Image.micromamba`.
    """

    force_build: bool
    inside_exceptions: list[Exception]
    _serve_mounts: frozenset[modal.mount.Mount]
    _deferred_mounts: collections.abc.Sequence[modal.mount.Mount]
    _added_python_source_set: frozenset[str]
    _metadata: typing.Optional[modal_proto.api_pb2.ImageMetadata]

    def __init__(self, *args, **kwargs):
        """mdmd:hidden"""
        ...

    def _initialize_from_empty(self): ...
    def _initialize_from_other(self, other: Image): ...
    def _get_metadata(self) -> typing.Optional[google.protobuf.message.Message]: ...
    def _hydrate_metadata(self, metadata: typing.Optional[google.protobuf.message.Message]): ...
    def _add_mount_layer_or_copy(self, mount: modal.mount.Mount, copy: bool = False): ...
    @property
    def _mount_layers(self) -> typing.Sequence[modal.mount.Mount]:
        """Non-evaluated mount layers on the image

        When the image is used by a Modal container, these mounts need to be attached as well to
        represent the full image content, as they haven't yet been represented as a layer in the
        image.

        When the image is used as a base image for a new layer (that is not itself a mount layer)
        these mounts need to first be inserted as a copy operation (.copy_mount) into the image.
        """
        ...

    def _assert_no_mount_layers(self): ...
    @staticmethod
    def _from_args(
        *,
        base_images: typing.Optional[dict[str, Image]] = None,
        dockerfile_function: typing.Optional[
            collections.abc.Callable[
                [typing.Literal["2023.12", "2024.04", "2024.10", "2025.06", "PREVIEW"]], DockerfileSpec
            ]
        ] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret.Secret]] = None,
        gpu_config: typing.Optional[modal_proto.api_pb2.GPUConfig] = None,
        build_function: typing.Optional[modal.functions.Function] = None,
        build_function_input: typing.Optional[modal_proto.api_pb2.FunctionInput] = None,
        image_registry_config: typing.Optional[_ImageRegistryConfig] = None,
        context_mount_function: typing.Optional[
            collections.abc.Callable[[], typing.Optional[modal.mount.Mount]]
        ] = None,
        force_build: bool = False,
        build_args: dict[str, str] = {},
        validated_volumes: typing.Optional[collections.abc.Sequence[tuple[str, modal.volume.Volume]]] = None,
        _namespace: int = 1,
        _do_assert_no_mount_layers: bool = True,
    ): ...
    def _copy_mount(self, mount: modal.mount.Mount, remote_path: typing.Union[str, pathlib.Path] = ".") -> Image:
        """mdmd:hidden
        Internal
        """
        ...

    def add_local_file(
        self, local_path: typing.Union[str, pathlib.Path], remote_path: str, *, copy: bool = False
    ) -> Image:
        """Adds a local file to the image at `remote_path` within the container

        By default (`copy=False`), the files are added to containers on startup and are not built into the actual Image,
        which speeds up deployment.

        Set `copy=True` to copy the files into an Image layer at build time instead, similar to how
        [`COPY`](https://docs.docker.com/engine/reference/builder/#copy) works in a `Dockerfile`.

        copy=True can slow down iteration since it requires a rebuild of the Image and any subsequent
        build steps whenever the included files change, but it is required if you want to run additional
        build steps after this one.

        *Added in v0.66.40*: This method replaces the deprecated `modal.Image.copy_local_file` method.
        """
        ...

    def add_local_dir(
        self,
        local_path: typing.Union[str, pathlib.Path],
        remote_path: str,
        *,
        copy: bool = False,
        ignore: typing.Union[collections.abc.Sequence[str], collections.abc.Callable[[pathlib.Path], bool]] = [],
    ) -> Image:
        """Adds a local directory's content to the image at `remote_path` within the container

        By default (`copy=False`), the files are added to containers on startup and are not built into the actual Image,
        which speeds up deployment.

        Set `copy=True` to copy the files into an Image layer at build time instead, similar to how
        [`COPY`](https://docs.docker.com/engine/reference/builder/#copy) works in a `Dockerfile`.

        copy=True can slow down iteration since it requires a rebuild of the Image and any subsequent
        build steps whenever the included files change, but it is required if you want to run additional
        build steps after this one.

        **Usage:**

        ```python
        from modal import FilePatternMatcher

        image = modal.Image.debian_slim().add_local_dir(
            "~/assets",
            remote_path="/assets",
            ignore=["*.venv"],
        )

        image = modal.Image.debian_slim().add_local_dir(
            "~/assets",
            remote_path="/assets",
            ignore=lambda p: p.is_relative_to(".venv"),
        )

        image = modal.Image.debian_slim().add_local_dir(
            "~/assets",
            remote_path="/assets",
            ignore=FilePatternMatcher("**/*.txt"),
        )

        # When including files is simpler than excluding them, you can use the `~` operator to invert the matcher.
        image = modal.Image.debian_slim().add_local_dir(
            "~/assets",
            remote_path="/assets",
            ignore=~FilePatternMatcher("**/*.py"),
        )

        # You can also read ignore patterns from a file.
        image = modal.Image.debian_slim().add_local_dir(
            "~/assets",
            remote_path="/assets",
            ignore=FilePatternMatcher.from_file("/path/to/ignorefile"),
        )
        ```

        *Added in v0.66.40*: This method replaces the deprecated `modal.Image.copy_local_dir` method.
        """
        ...

    def add_local_python_source(
        self,
        *module_names: str,
        copy: bool = False,
        ignore: typing.Union[
            collections.abc.Sequence[str], collections.abc.Callable[[pathlib.Path], bool]
        ] = modal.file_pattern_matcher.NON_PYTHON_FILES,
    ) -> Image:
        """Adds locally available Python packages/modules to containers

        Adds all files from the specified Python package or module to containers running the Image.

        Packages are added to the `/root` directory of containers, which is on the `PYTHONPATH`
        of any executed Modal Functions, enabling import of the module by that name.

        By default (`copy=False`), the files are added to containers on startup and are not built into the actual Image,
        which speeds up deployment.

        Set `copy=True` to copy the files into an Image layer at build time instead. This can slow down iteration since
        it requires a rebuild of the Image and any subsequent build steps whenever the included files change, but it is
        required if you want to run additional build steps after this one.

        **Note:** This excludes all dot-prefixed subdirectories or files and all `.pyc`/`__pycache__` files.
        To add full directories with finer control, use `.add_local_dir()` instead and specify `/root` as
        the destination directory.

        By default only includes `.py`-files in the source modules. Set the `ignore` argument to a list of patterns
        or a callable to override this behavior, e.g.:

        ```py
        # includes everything except data.json
        modal.Image.debian_slim().add_local_python_source("mymodule", ignore=["data.json"])

        # exclude large files
        modal.Image.debian_slim().add_local_python_source(
            "mymodule",
            ignore=lambda p: p.stat().st_size > 1e9
        )
        ```

        *Added in v0.67.28*: This method replaces the deprecated `modal.Mount.from_local_python_packages` pattern.
        """
        ...

    class __from_id_spec(typing_extensions.Protocol[SUPERSELF]):
        def __call__(self, /, image_id: str, client: typing.Optional[modal.client.Client] = None) -> SUPERSELF:
            """Construct an Image from an id and look up the Image result.

            The ID of an Image object can be accessed using `.object_id`.
            """
            ...

        async def aio(self, /, image_id: str, client: typing.Optional[modal.client.Client] = None): ...

    from_id: typing.ClassVar[__from_id_spec[typing_extensions.Self]]

    class __build_spec(typing_extensions.Protocol):
        def __call__(self, /, app: modal.app.App) -> Image:
            """Eagerly build an image.

            If your image was previously built, then this method will not rebuild your image
            and your cached image is returned.

            **Examples**

            ```python
            image = modal.Image.debian_slim().uv_pip_install("scipy", "numpy")

            app = modal.App.lookup("build-image", create_if_missing=True)
            with modal.enable_output():  # To see logs in your local terminal
                image.build(app)

            # Save the image id
            my_image_id = image.object_id

            # Reference the image with the id or uses it another context.
            built_image = modal.Image.from_id(my_image_id)
            ```

            Alternatively, you can pre-build a image and use it in a sandbox.

            ```python notest
            app = modal.App.lookup("sandbox-example", create_if_missing=True)

            with modal.enable_output():
                image = modal.Image.debian_slim().uv_pip_install("scipy")
                image.build(app)

            sb = modal.Sandbox.create("python", "-c", "import scipy; print(scipy)", app=app, image=image)
            print(sb.stdout.read())
            sb.terminate()
            ```

            **Note**

            For defining Modal functions, images are built automatically when deploying or running an App.
            You do not need to built the image explicitly:

            ```python notest
            app = modal.App()
            image = modal.Image.debian_slim()

            # No need to explicitly build the image for defining a function.
            @app.function(image=image)
            def f():
                ...
            ```
            """
            ...

        async def aio(self, /, app: modal.app.App) -> Image:
            """Eagerly build an image.

            If your image was previously built, then this method will not rebuild your image
            and your cached image is returned.

            **Examples**

            ```python
            image = modal.Image.debian_slim().uv_pip_install("scipy", "numpy")

            app = modal.App.lookup("build-image", create_if_missing=True)
            with modal.enable_output():  # To see logs in your local terminal
                image.build(app)

            # Save the image id
            my_image_id = image.object_id

            # Reference the image with the id or uses it another context.
            built_image = modal.Image.from_id(my_image_id)
            ```

            Alternatively, you can pre-build a image and use it in a sandbox.

            ```python notest
            app = modal.App.lookup("sandbox-example", create_if_missing=True)

            with modal.enable_output():
                image = modal.Image.debian_slim().uv_pip_install("scipy")
                image.build(app)

            sb = modal.Sandbox.create("python", "-c", "import scipy; print(scipy)", app=app, image=image)
            print(sb.stdout.read())
            sb.terminate()
            ```

            **Note**

            For defining Modal functions, images are built automatically when deploying or running an App.
            You do not need to built the image explicitly:

            ```python notest
            app = modal.App()
            image = modal.Image.debian_slim()

            # No need to explicitly build the image for defining a function.
            @app.function(image=image)
            def f():
                ...
            ```
            """
            ...

    build: __build_spec

    def pip_install(
        self,
        *packages: typing.Union[str, list[str]],
        find_links: typing.Optional[str] = None,
        index_url: typing.Optional[str] = None,
        extra_index_url: typing.Optional[str] = None,
        pre: bool = False,
        extra_options: str = "",
        force_build: bool = False,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret.Secret]] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
    ) -> Image:
        """Install a list of Python packages using pip.

        **Examples**

        Simple installation:
        ```python
        image = modal.Image.debian_slim().pip_install("click", "httpx~=0.23.3")
        ```

        More complex installation:
        ```python
        image = (
            modal.Image.from_registry(
                "nvidia/cuda:12.2.0-devel-ubuntu22.04", add_python="3.11"
            )
            .pip_install(
                "ninja",
                "packaging",
                "wheel",
                "transformers==4.40.2",
            )
            .pip_install(
                "flash-attn==2.5.8", extra_options="--no-build-isolation"
            )
        )
        ```
        """
        ...

    def pip_install_private_repos(
        self,
        *repositories: str,
        git_user: str,
        find_links: typing.Optional[str] = None,
        index_url: typing.Optional[str] = None,
        extra_index_url: typing.Optional[str] = None,
        pre: bool = False,
        extra_options: str = "",
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret.Secret]] = None,
        force_build: bool = False,
    ) -> Image:
        """Install a list of Python packages from private git repositories using pip.

        This method currently supports Github and Gitlab only.

        - **Github:** Provide a `modal.Secret` that contains a `GITHUB_TOKEN` key-value pair
        - **Gitlab:** Provide a `modal.Secret` that contains a `GITLAB_TOKEN` key-value pair

        These API tokens should have permissions to read the list of private repositories provided as arguments.

        We recommend using Github's ['fine-grained' access tokens](https://github.blog/2022-10-18-introducing-fine-grained-personal-access-tokens-for-github/).
        These tokens are repo-scoped, and avoid granting read permission across all of a user's private repos.

        **Example**

        ```python
        image = (
            modal.Image
            .debian_slim()
            .pip_install_private_repos(
                "github.com/ecorp/private-one@1.0.0",
                "github.com/ecorp/private-two@main"
                "github.com/ecorp/private-three@d4776502"
                # install from 'inner' directory on default branch.
                "github.com/ecorp/private-four#subdirectory=inner",
                git_user="erikbern",
                secrets=[modal.Secret.from_name("github-read-private")],
            )
        )
        ```
        """
        ...

    def pip_install_from_requirements(
        self,
        requirements_txt: str,
        find_links: typing.Optional[str] = None,
        *,
        index_url: typing.Optional[str] = None,
        extra_index_url: typing.Optional[str] = None,
        pre: bool = False,
        extra_options: str = "",
        force_build: bool = False,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret.Secret]] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
    ) -> Image:
        """Install a list of Python packages from a local `requirements.txt` file."""
        ...

    def pip_install_from_pyproject(
        self,
        pyproject_toml: str,
        optional_dependencies: list[str] = [],
        *,
        find_links: typing.Optional[str] = None,
        index_url: typing.Optional[str] = None,
        extra_index_url: typing.Optional[str] = None,
        pre: bool = False,
        extra_options: str = "",
        force_build: bool = False,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret.Secret]] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
    ) -> Image:
        """Install dependencies specified by a local `pyproject.toml` file.

        `optional_dependencies` is a list of the keys of the
        optional-dependencies section(s) of the `pyproject.toml` file
        (e.g. test, doc, experiment, etc). When provided,
        all of the packages in each listed section are installed as well.
        """
        ...

    def uv_pip_install(
        self,
        *packages: typing.Union[str, list[str]],
        requirements: typing.Optional[list[str]] = None,
        find_links: typing.Optional[str] = None,
        index_url: typing.Optional[str] = None,
        extra_index_url: typing.Optional[str] = None,
        pre: bool = False,
        extra_options: str = "",
        force_build: bool = False,
        uv_version: typing.Optional[str] = None,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret.Secret]] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
    ) -> Image:
        """Install a list of Python packages using uv pip install.

        **Examples**

        Simple installation:
        ```python
        image = modal.Image.debian_slim().uv_pip_install("torch==2.7.1", "numpy")
        ```

        This method assumes that:
        - Python is on the `$PATH` and dependencies are installed with the first Python on the `$PATH`.
        - Shell supports backticks for substitution
        - `which` command is on the `$PATH`

        Added in v1.1.0.
        """
        ...

    def poetry_install_from_file(
        self,
        poetry_pyproject_toml: str,
        poetry_lockfile: typing.Optional[str] = None,
        *,
        ignore_lockfile: bool = False,
        force_build: bool = False,
        with_: list[str] = [],
        without: list[str] = [],
        only: list[str] = [],
        poetry_version: typing.Optional[str] = "latest",
        old_installer: bool = False,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret.Secret]] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
    ) -> Image:
        """Install poetry *dependencies* specified by a local `pyproject.toml` file.

        If not provided as argument the path to the lockfile is inferred. However, the
        file has to exist, unless `ignore_lockfile` is set to `True`.

        Note that the root project of the poetry project is not installed, only the dependencies.
        For including local python source files see `add_local_python_source`

        Poetry will be installed to the Image (using pip) unless `poetry_version` is set to None.
        Note that the interpretation of `poetry_version="latest"` depends on the Modal Image Builder
        version, with versions 2024.10 and earlier limiting poetry to 1.x.
        """
        ...

    def uv_sync(
        self,
        uv_project_dir: str = "./",
        *,
        force_build: bool = False,
        groups: typing.Optional[list[str]] = None,
        extras: typing.Optional[list[str]] = None,
        frozen: bool = True,
        extra_options: str = "",
        uv_version: typing.Optional[str] = None,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret.Secret]] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
    ) -> Image:
        """Creates a virtual environment with the dependencies in a uv managed project with `uv sync`.

        **Examples**
        ```python
        image = modal.Image.debian_slim().uv_sync()
        ```

        The `pyproject.toml` and `uv.lock` in `uv_project_dir` are automatically added to the build context. The
        `uv_project_dir` is relative to the current working directory of where `modal` is called.

        NOTE: This does *not* install the project itself into the environment (this is equivalent to the
        `--no-install-project` flag in the `uv sync` command) and you would be expected to add any local python source
        files using `Image.add_local_python_source` or similar methods after this call.

        This ensures that updates to your project code wouldn't require reinstalling third-party dependencies
        after every change.

        uv workspaces are currently not supported.

        Added in v1.1.0.
        """
        ...

    def dockerfile_commands(
        self,
        *dockerfile_commands: typing.Union[str, list[str]],
        context_files: dict[str, str] = {},
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret.Secret]] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
        context_dir: typing.Union[str, pathlib.Path, None] = None,
        force_build: bool = False,
        ignore: typing.Union[
            collections.abc.Sequence[str], collections.abc.Callable[[pathlib.Path], bool]
        ] = modal.image.AUTO_DOCKERIGNORE,
    ) -> Image:
        """Extend an image with arbitrary Dockerfile-like commands.

        **Usage:**

        ```python
        from modal import FilePatternMatcher

        # By default a .dockerignore file is used if present in the current working directory
        image = modal.Image.debian_slim().dockerfile_commands(
            ["COPY data /data"],
        )

        image = modal.Image.debian_slim().dockerfile_commands(
            ["COPY data /data"],
            ignore=["*.venv"],
        )

        image = modal.Image.debian_slim().dockerfile_commands(
            ["COPY data /data"],
            ignore=lambda p: p.is_relative_to(".venv"),
        )

        image = modal.Image.debian_slim().dockerfile_commands(
            ["COPY data /data"],
            ignore=FilePatternMatcher("**/*.txt"),
        )

        # When including files is simpler than excluding them, you can use the `~` operator to invert the matcher.
        image = modal.Image.debian_slim().dockerfile_commands(
            ["COPY data /data"],
            ignore=~FilePatternMatcher("**/*.py"),
        )

        # You can also read ignore patterns from a file.
        image = modal.Image.debian_slim().dockerfile_commands(
            ["COPY data /data"],
            ignore=FilePatternMatcher.from_file("/path/to/dockerignore"),
        )
        ```
        """
        ...

    def entrypoint(self, entrypoint_commands: list[str]) -> Image:
        """Set the ENTRYPOINT for the image."""
        ...

    def shell(self, shell_commands: list[str]) -> Image:
        """Overwrite default shell for the image."""
        ...

    def run_commands(
        self,
        *commands: typing.Union[str, list[str]],
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret.Secret]] = None,
        volumes: typing.Optional[dict[typing.Union[str, pathlib.PurePosixPath], modal.volume.Volume]] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
        force_build: bool = False,
    ) -> Image:
        """Extend an image with a list of shell commands to run."""
        ...

    @staticmethod
    def micromamba(python_version: typing.Optional[str] = None, force_build: bool = False) -> Image:
        """A Micromamba base image. Micromamba allows for fast building of small Conda-based containers."""
        ...

    def micromamba_install(
        self,
        *packages: typing.Union[str, list[str]],
        spec_file: typing.Optional[str] = None,
        channels: list[str] = [],
        force_build: bool = False,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret.Secret]] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
    ) -> Image:
        """Install a list of additional packages using micromamba."""
        ...

    @staticmethod
    def _registry_setup_commands(
        tag: str,
        builder_version: typing.Literal["2023.12", "2024.04", "2024.10", "2025.06", "PREVIEW"],
        setup_commands: list[str],
        add_python: typing.Optional[str] = None,
    ) -> list[str]: ...
    @staticmethod
    def from_registry(
        tag: str,
        secret: typing.Optional[modal.secret.Secret] = None,
        *,
        setup_dockerfile_commands: list[str] = [],
        force_build: bool = False,
        add_python: typing.Optional[str] = None,
        **kwargs,
    ) -> Image:
        """Build a Modal Image from a public or private image registry, such as Docker Hub.

        The image must be built for the `linux/amd64` platform.

        If your image does not come with Python installed, you can use the `add_python` parameter
        to specify a version of Python to add to the image. Otherwise, the image is expected to
        have Python on PATH as `python`, along with `pip`.

        You may also use `setup_dockerfile_commands` to run Dockerfile commands before the
        remaining commands run. This might be useful if you want a custom Python installation or to
        set a `SHELL`. Prefer `run_commands()` when possible though.

        To authenticate against a private registry with static credentials, you must set the `secret` parameter to
        a `modal.Secret` containing a username (`REGISTRY_USERNAME`) and
        an access token or password (`REGISTRY_PASSWORD`).

        To authenticate against private registries with credentials from a cloud provider,
        use `Image.from_gcp_artifact_registry()` or `Image.from_aws_ecr()`.

        **Examples**

        ```python
        modal.Image.from_registry("python:3.11-slim-bookworm")
        modal.Image.from_registry("ubuntu:22.04", add_python="3.11")
        modal.Image.from_registry("nvcr.io/nvidia/pytorch:22.12-py3")
        ```
        """
        ...

    @staticmethod
    def from_gcp_artifact_registry(
        tag: str,
        secret: typing.Optional[modal.secret.Secret] = None,
        *,
        setup_dockerfile_commands: list[str] = [],
        force_build: bool = False,
        add_python: typing.Optional[str] = None,
        **kwargs,
    ) -> Image:
        """Build a Modal image from a private image in Google Cloud Platform (GCP) Artifact Registry.

        You will need to pass a `modal.Secret` containing [your GCP service account key data](https://cloud.google.com/iam/docs/keys-create-delete#creating)
        as `SERVICE_ACCOUNT_JSON`. This can be done from the [Secrets](https://modal.com/secrets) page.
        Your service account should be granted a specific role depending on the GCP registry used:

        - For Artifact Registry images (`pkg.dev` domains) use
          the ["Artifact Registry Reader"](https://cloud.google.com/artifact-registry/docs/access-control#roles) role
        - For Container Registry images (`gcr.io` domains) use
          the ["Storage Object Viewer"](https://cloud.google.com/artifact-registry/docs/transition/setup-gcr-repo) role

        **Note:** This method does not use `GOOGLE_APPLICATION_CREDENTIALS` as that
        variable accepts a path to a JSON file, not the actual JSON string.

        See `Image.from_registry()` for information about the other parameters.

        **Example**

        ```python
        modal.Image.from_gcp_artifact_registry(
            "us-east1-docker.pkg.dev/my-project-1234/my-repo/my-image:my-version",
            secret=modal.Secret.from_name(
                "my-gcp-secret",
                required_keys=["SERVICE_ACCOUNT_JSON"],
            ),
            add_python="3.11",
        )
        ```
        """
        ...

    @staticmethod
    def from_aws_ecr(
        tag: str,
        secret: typing.Optional[modal.secret.Secret] = None,
        *,
        setup_dockerfile_commands: list[str] = [],
        force_build: bool = False,
        add_python: typing.Optional[str] = None,
        **kwargs,
    ) -> Image:
        """Build a Modal image from a private image in AWS Elastic Container Registry (ECR).

        You will need to pass a `modal.Secret` containing either IAM user credentials or OIDC
        configuration to access the target ECR registry.

        For IAM user authentication, set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION`.

        For OIDC authentication, set `AWS_ROLE_ARN` and `AWS_REGION`.

        IAM configuration details can be found in the AWS documentation for
        ["Private repository policies"](https://docs.aws.amazon.com/AmazonECR/latest/userguide/repository-policies.html).

        For more details on using an AWS role to access ECR, see the [OIDC integration guide](https://modal.com/docs/guide/oidc-integration).

        See `Image.from_registry()` for information about the other parameters.

        **Example**

        ```python
        modal.Image.from_aws_ecr(
            "000000000000.dkr.ecr.us-east-1.amazonaws.com/my-private-registry:my-version",
            secret=modal.Secret.from_name(
                "aws",
                required_keys=["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
            ),
            add_python="3.11",
        )
        ```
        """
        ...

    @staticmethod
    def from_dockerfile(
        path: typing.Union[str, pathlib.Path],
        *,
        force_build: bool = False,
        context_dir: typing.Union[str, pathlib.Path, None] = None,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret.Secret]] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
        add_python: typing.Optional[str] = None,
        build_args: dict[str, str] = {},
        ignore: typing.Union[
            collections.abc.Sequence[str], collections.abc.Callable[[pathlib.Path], bool]
        ] = modal.image.AUTO_DOCKERIGNORE,
    ) -> Image:
        """Build a Modal image from a local Dockerfile.

        If your Dockerfile does not have Python installed, you can use the `add_python` parameter
        to specify a version of Python to add to the image.

        **Usage:**

        ```python
        from modal import FilePatternMatcher

        # By default a .dockerignore file is used if present in the current working directory
        image = modal.Image.from_dockerfile(
            "./Dockerfile",
            add_python="3.12",
        )

        image = modal.Image.from_dockerfile(
            "./Dockerfile",
            add_python="3.12",
            ignore=["*.venv"],
        )

        image = modal.Image.from_dockerfile(
            "./Dockerfile",
            add_python="3.12",
            ignore=lambda p: p.is_relative_to(".venv"),
        )

        image = modal.Image.from_dockerfile(
            "./Dockerfile",
            add_python="3.12",
            ignore=FilePatternMatcher("**/*.txt"),
        )

        # When including files is simpler than excluding them, you can use the `~` operator to invert the matcher.
        image = modal.Image.from_dockerfile(
            "./Dockerfile",
            add_python="3.12",
            ignore=~FilePatternMatcher("**/*.py"),
        )

        # You can also read ignore patterns from a file.
        image = modal.Image.from_dockerfile(
            "./Dockerfile",
            add_python="3.12",
            ignore=FilePatternMatcher.from_file("/path/to/dockerignore"),
        )
        ```
        """
        ...

    @staticmethod
    def debian_slim(python_version: typing.Optional[str] = None, force_build: bool = False) -> Image:
        """Default image, based on the official `python` Docker images."""
        ...

    def apt_install(
        self,
        *packages: typing.Union[str, list[str]],
        force_build: bool = False,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret.Secret]] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
    ) -> Image:
        """Install a list of Debian packages using `apt`.

        **Example**

        ```python
        image = modal.Image.debian_slim().apt_install("git")
        ```
        """
        ...

    def run_function(
        self,
        raw_f: collections.abc.Callable[..., typing.Any],
        *,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret.Secret]] = None,
        volumes: dict[
            typing.Union[str, pathlib.PurePosixPath],
            typing.Union[modal.volume.Volume, modal.cloud_bucket_mount.CloudBucketMount],
        ] = {},
        network_file_systems: dict[
            typing.Union[str, pathlib.PurePosixPath], modal.network_file_system.NetworkFileSystem
        ] = {},
        gpu: typing.Union[None, str, modal.gpu._GPUConfig, list[typing.Union[None, str, modal.gpu._GPUConfig]]] = None,
        cpu: typing.Optional[float] = None,
        memory: typing.Optional[int] = None,
        timeout: int = 3600,
        cloud: typing.Optional[str] = None,
        region: typing.Union[str, collections.abc.Sequence[str], None] = None,
        force_build: bool = False,
        args: collections.abc.Sequence[typing.Any] = (),
        kwargs: dict[str, typing.Any] = {},
        include_source: bool = True,
    ) -> Image:
        """Run user-defined function `raw_f` as an image build step.

        The function runs like an ordinary Modal Function, accepting a resource configuration and integrating
        with Modal features like Secrets and Volumes. Unlike ordinary Modal Functions, any changes to the
        filesystem state will be captured on container exit and saved as a new Image.

        **Note**

        Only the source code of `raw_f`, the contents of `**kwargs`, and any referenced *global* variables
        are used to determine whether the image has changed and needs to be rebuilt.
        If this function references other functions or variables, the image will not be rebuilt if you
        make changes to them. You can force a rebuild by changing the function's source code itself.

        **Example**

        ```python notest

        def my_build_function():
            open("model.pt", "w").write("parameters!")

        image = (
            modal.Image
                .debian_slim()
                .pip_install("torch")
                .run_function(my_build_function, secrets=[...], mounts=[...])
        )
        ```
        """
        ...

    def env(self, vars: dict[str, str]) -> Image:
        """Sets the environment variables in an Image.

        **Example**

        ```python
        image = (
            modal.Image.debian_slim()
            .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
        )
        ```
        """
        ...

    def workdir(self, path: typing.Union[str, pathlib.PurePosixPath]) -> Image:
        """Set the working directory for subsequent image build steps and function execution.

        **Example**

        ```python
        image = (
            modal.Image.debian_slim()
            .run_commands("git clone https://xyz app")
            .workdir("/app")
            .run_commands("yarn install")
        )
        ```
        """
        ...

    def cmd(self, cmd: list[str]) -> Image:
        """Set the default command (`CMD`) to run when a container is started.

        Used with `modal.Sandbox`. Has no effect on `modal.Function`.

        **Example**

        ```python
        image = (
            modal.Image.debian_slim().cmd(["python", "app.py"])
        )
        ```
        """
        ...

    def imports(self):
        """Used to import packages in global scope that are only available when running remotely.
        By using this context manager you can avoid an `ImportError` due to not having certain
        packages installed locally.

        **Usage:**

        ```python notest
        with image.imports():
            import torch
        ```
        """
        ...

    class ___logs_spec(typing_extensions.Protocol):
        def __call__(self, /) -> typing.Generator[str, None, None]:
            """Streams logs from an image, or returns logs from an already completed image.

            This method is considered private since its interface may change - use it at your own risk!
            """
            ...

        def aio(self, /) -> typing.AsyncGenerator[str, None]:
            """Streams logs from an image, or returns logs from an already completed image.

            This method is considered private since its interface may change - use it at your own risk!
            """
            ...

    _logs: ___logs_spec

    class __hydrate_spec(typing_extensions.Protocol[SUPERSELF]):
        def __call__(self, /, client: typing.Optional[modal.client.Client] = None) -> SUPERSELF:
            """mdmd:hidden"""
            ...

        async def aio(self, /, client: typing.Optional[modal.client.Client] = None) -> SUPERSELF:
            """mdmd:hidden"""
            ...

    hydrate: __hydrate_spec[typing_extensions.Self]

SUPPORTED_PYTHON_SERIES: dict[typing.Literal["2023.12", "2024.04", "2024.10", "2025.06", "PREVIEW"], list[str]]
