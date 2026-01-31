# Copyright Modal Labs 2022
import inspect
import typing
from collections.abc import AsyncGenerator, Collection, Coroutine, Mapping, Sequence
from dataclasses import dataclass
from pathlib import PurePosixPath
from textwrap import dedent
from typing import (
    Any,
    Callable,
    ClassVar,
    Optional,
    Union,
    overload,
)

import typing_extensions
from google.protobuf.message import Message
from synchronicity.async_wrap import asynccontextmanager

from modal_proto import api_pb2

from ._functions import _Function
from ._ipython import is_interactive_ipython
from ._load_context import LoadContext
from ._object import _get_environment_name, _Object
from ._partial_function import (
    _find_partial_methods_for_user_cls,
    _PartialFunction,
    _PartialFunctionFlags,
    verify_concurrent_params,
)
from ._server import _Server, validate_http_server_config
from ._utils.async_utils import synchronize_api
from ._utils.deprecation import (
    deprecation_warning,
    warn_on_renamed_autoscaler_settings,
)
from ._utils.function_utils import (
    FunctionInfo,
    is_flash_object,
    is_global_object,
    is_method_fn,
)
from ._utils.mount_utils import validate_volumes
from ._utils.name_utils import check_object_name, check_tag_dict
from .client import _Client
from .cloud_bucket_mount import _CloudBucketMount
from .cls import _Cls, parameter
from .config import logger
from .exception import ExecutionError, InvalidError
from .functions import Function
from .gpu import GPU_T
from .image import _Image
from .network_file_system import _NetworkFileSystem
from .partial_function import PartialFunction
from .proxy import _Proxy
from .retries import Retries
from .running_app import RunningApp
from .schedule import Schedule
from .scheduler_placement import SchedulerPlacement
from .secret import _Secret
from .volume import _Volume

_default_image: _Image = _Image.debian_slim()


class _LocalEntrypoint:
    _info: FunctionInfo
    _app: "_App"

    def __init__(self, info: FunctionInfo, app: "_App") -> None:
        self._info = info
        self._app = app

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        return self._info.raw_f(*args, **kwargs)

    @property
    def info(self) -> FunctionInfo:
        return self._info

    @property
    def app(self) -> "_App":
        return self._app


LocalEntrypoint = synchronize_api(_LocalEntrypoint)


def check_sequence(items: typing.Sequence[typing.Any], item_type: type[typing.Any], error_msg: str) -> None:
    if not isinstance(items, (list, tuple)):
        raise InvalidError(error_msg)
    if not all(isinstance(v, item_type) for v in items):
        raise InvalidError(error_msg)


CLS_T = typing.TypeVar("CLS_T", bound=type[Any])


P = typing_extensions.ParamSpec("P")
ReturnType = typing.TypeVar("ReturnType")
OriginalReturnType = typing.TypeVar("OriginalReturnType")


class _FunctionDecoratorType:
    @overload
    def __call__(
        self, func: PartialFunction[P, ReturnType, OriginalReturnType]
    ) -> Function[P, ReturnType, OriginalReturnType]: ...  # already wrapped by a modal decorator, e.g. web_endpoint

    @overload
    def __call__(
        self, func: Callable[P, Coroutine[Any, Any, ReturnType]]
    ) -> Function[P, ReturnType, Coroutine[Any, Any, ReturnType]]: ...  # decorated async function

    @overload
    def __call__(
        self, func: Callable[P, ReturnType]
    ) -> Function[P, ReturnType, ReturnType]: ...  # decorated non-async function

    def __call__(self, func): ...


@dataclass()
class _LocalAppState:
    """All state for apps that's part of the local/definition state"""

    functions: dict[str, _Function]
    classes: dict[str, _Cls]
    image_default: Optional[_Image]
    web_endpoints: list[str]  # Used by the CLI
    local_entrypoints: dict[str, _LocalEntrypoint]
    tags: dict[str, str]

    include_source_default: bool
    secrets_default: Sequence[_Secret]
    volumes_default: dict[Union[str, PurePosixPath], _Volume]


class _App:
    """A Modal App is a group of functions and classes that are deployed together.

    The app serves at least three purposes:

    * A unit of deployment for functions and classes.
    * Syncing of identities of (primarily) functions and classes across processes
      (your local Python interpreter and every Modal container active in your application).
    * Manage log collection for everything that happens inside your code.

    **Registering functions with an app**

    The most common way to explicitly register an Object with an app is through the
    `@app.function()` decorator. It both registers the annotated function itself and
    other passed objects, like schedules and secrets, with the app:

    ```python
    import modal

    app = modal.App()

    @app.function(
        secrets=[modal.Secret.from_name("some_secret")],
        schedule=modal.Period(days=1),
    )
    def foo():
        pass
    ```

    In this example, the secret and schedule are registered with the app.
    """

    _all_apps: ClassVar[dict[Optional[str], list["_App"]]] = {}
    _container_app: ClassVar[Optional["_App"]] = None

    _name: Optional[str]
    _description: Optional[str]

    _local_state_attr: Optional[_LocalAppState] = None

    # Running apps only (container apps or running local)
    _app_id: Optional[str]  # Kept after app finishes
    _running_app: Optional[RunningApp]  # Various app info
    _client: Optional[_Client]

    # Metadata for loading objects within this app
    # passed by reference to functions and classes so it can be updated by run()/deploy()
    _root_load_context: LoadContext

    @property
    def _local_state(self) -> _LocalAppState:
        """For internal use only. Do not use this property directly."""

        if self._local_state_attr is None:
            raise AttributeError("Local state is not initialized - app is not locally available")
        return self._local_state_attr

    def __init__(
        self,
        name: Optional[str] = None,
        *,
        tags: Optional[dict[str, str]] = None,  # Additional metadata to set on the App
        image: Optional[_Image] = None,  # Default Image for the App (otherwise default to `modal.Image.debian_slim()`)
        secrets: Sequence[_Secret] = [],  # Secrets to add for all Functions in the App
        volumes: dict[Union[str, PurePosixPath], _Volume] = {},  # Volume mounts to use for all Functions
        include_source: bool = True,  # Default configuration for adding Function source file(s) to the Modal container
    ) -> None:
        """Construct a new app, optionally with default image, mounts, secrets, or volumes.

        ```python notest
        image = modal.Image.debian_slim().pip_install(...)
        secret = modal.Secret.from_name("my-secret")
        volume = modal.Volume.from_name("my-data")
        app = modal.App(image=image, secrets=[secret], volumes={"/mnt/data": volume})
        ```
        """
        if name is not None and not isinstance(name, str):
            raise InvalidError("Invalid value for `name`: Must be string.")

        if tags is not None:
            check_tag_dict(tags)

        self._name = name
        self._description = name

        check_sequence(secrets, _Secret, "`secrets=` has to be a list or tuple of `modal.Secret` objects")
        validate_volumes(volumes)

        if image is not None and not isinstance(image, _Image):
            raise InvalidError("`image=` has to be a `modal.Image` object")

        self._local_state_attr = _LocalAppState(
            functions={},
            classes={},
            image_default=image,
            secrets_default=secrets,
            volumes_default=volumes,
            include_source_default=include_source,
            web_endpoints=[],
            local_entrypoints={},
            tags=tags or {},
        )

        # Running apps only
        self._app_id = None
        self._running_app = None  # Set inside container, OR during the time an app is running locally

        # Client is special - needed to be set just before the app is "hydrated" or running at the latest
        # Guaranteed to be set for running apps, but also needed to actually *hydrate* the app and make it running
        self._client = None
        self._root_load_context = LoadContext.empty()

        # Register this app. This is used to look up the app in the container, when we can't get it from the function
        _App._all_apps.setdefault(self._name, []).append(self)

    @property
    def name(self) -> Optional[str]:
        """The user-provided name of the App."""
        return self._name

    @property
    def is_interactive(self) -> bool:
        """mdmd:hidden
        Whether the current app for the app is running in interactive mode.

        Note: this method will likely be deprecated in the future.

        """
        # return self._name
        if self._running_app:
            return self._running_app.interactive
        else:
            return False

    @property
    def app_id(self) -> Optional[str]:
        """Return the app_id of a running or stopped app."""
        return self._app_id

    @property
    def description(self) -> Optional[str]:
        """The App's `name`, if available, or a fallback descriptive identifier."""
        return self._description

    @staticmethod
    async def lookup(
        name: str,
        *,
        client: Optional[_Client] = None,
        environment_name: Optional[str] = None,
        create_if_missing: bool = False,
    ) -> "_App":
        """Look up an App with a given name, creating a new App if necessary.

        Note that Apps created through this method will be in a deployed state,
        but they will not have any associated Functions or Classes. This method
        is mainly useful for creating an App to associate with a Sandbox:

        ```python
        app = modal.App.lookup("my-app", create_if_missing=True)
        modal.Sandbox.create("echo", "hi", app=app)
        ```
        """
        check_object_name(name, "App")

        if client is None:
            client = await _Client.from_env()

        environment_name = _get_environment_name(environment_name)

        request = api_pb2.AppGetOrCreateRequest(
            app_name=name,
            environment_name=environment_name,
            object_creation_type=(api_pb2.OBJECT_CREATION_TYPE_CREATE_IF_MISSING if create_if_missing else None),
        )

        response = await client.stub.AppGetOrCreate(request)

        app = _App(name)  # TODO: this should probably be a distinct constructor, possibly even a distinct type
        app._local_state_attr = None  # this is not a locally defined App, so no local state
        app._app_id = response.app_id
        app._client = client
        app._root_load_context = LoadContext(client=client, environment_name=environment_name, app_id=response.app_id)
        app._running_app = RunningApp(response.app_id, interactive=False)
        return app

    def set_description(self, description: str):
        """mdmd:hidden
        Set the description of the App before it starts running.

        Note: we don't recommend using the method and may deprecate it in the future.
        """
        self._description = description

    def _validate_blueprint_value(self, key: str, value: Any):
        if not isinstance(value, _Object):
            raise InvalidError(f"App attribute `{key}` with value {value!r} is not a valid Modal object")

    @property
    def image(self) -> _Image:
        """mdmd:hidden
        Retrieve the Image that will be used as the default for any Functions registered to the App.

        Note: This property is only relevant in the build phase and won't be populated on a deployed
        App that is retrieved via `modal.App.lookup`. It is likely to be deprecated in the future.

        """
        return self._local_state.image_default

    @image.setter
    def image(self, value):
        """mdmd:hidden"""
        self._local_state.image_default = value

    def _uncreate_all_objects(self):
        # TODO(erikbern): this doesn't unhydrate objects that aren't tagged
        local_state = self._local_state
        for obj in local_state.functions.values():
            obj._unhydrate()
        for obj in local_state.classes.values():
            obj._unhydrate()

    @asynccontextmanager
    async def _set_local_app(self, client: _Client, running_app: RunningApp) -> AsyncGenerator[None, None]:
        self._app_id = running_app.app_id
        self._running_app = running_app
        self._client = client
        try:
            yield
        finally:
            self._running_app = None
            self._client = None
            self._uncreate_all_objects()

    @asynccontextmanager
    async def run(
        self,
        *,
        client: Optional[_Client] = None,
        detach: bool = False,
        interactive: bool = False,
        environment_name: Optional[str] = None,
    ) -> AsyncGenerator["_App", None]:
        """Context manager that runs an ephemeral app on Modal.

        Use this as the main entry point for your Modal application. All calls
        to Modal Functions should be made within the scope of this context
        manager, and they will correspond to the current App.

        **Example**

        ```python notest
        with app.run():
            some_modal_function.remote()
        ```

        To enable output printing (i.e., to see App logs), use `modal.enable_output()`:

        ```python notest
        with modal.enable_output():
            with app.run():
                some_modal_function.remote()
        ```

        Note that you should not invoke this in global scope of a file where you have
        Modal Functions or Classes defined, since that would run the block when the Function
        or Cls is imported in your containers as well. If you want to run it as your entrypoint,
        consider protecting it:

        ```python
        if __name__ == "__main__":
            with app.run():
                some_modal_function.remote()
        ```

        You can then run your script with:

        ```shell
        python app_module.py
        ```

        """
        from .runner import _run_app  # Defer import of runner.py, which imports a lot from Rich

        async with _run_app(
            self, client=client, detach=detach, interactive=interactive, environment_name=environment_name
        ):
            yield self

    async def deploy(
        self,
        *,
        name: Optional[str] = None,  # Name for the deployment, overriding any set on the App
        environment_name: Optional[str] = None,  # Environment to deploy the App in
        tag: str = "",  # Optional metadata that is specific to this deployment
        client: Optional[_Client] = None,  # Alternate client to use for communication with the server
    ) -> typing_extensions.Self:
        """Deploy the App so that it is available persistently.

        Deployed Apps will be available for lookup or web-based invocations until they are stopped.
        Unlike with `App.run`, this method will return as soon as the deployment completes.

        This method is a programmatic alternative to the `modal deploy` CLI command.

        Examples:

        ```python notest
        app = App("my-app")
        app.deploy()
        ```

        To enable output printing (i.e., to see build logs), use `modal.enable_output()`:

        ```python notest
        app = App("my-app")
        with modal.enable_output():
            app.deploy()
        ```

        Unlike with `App.run`, Function logs will not stream back to the local client after the
        App is deployed.

        Note that you should not invoke this method in global scope, as that would redeploy
        the App every time the file is imported. If you want to write a programmatic deployment
        script, protect this call so that it only runs when the file is executed directly:

        ```python notest
        if __name__ == "__main__":
            with modal.enable_output():
                app.deploy()
        ```

        Then you can deploy your app with:

        ```shell
        python app_module.py
        ```

        """
        from .runner import _deploy_app  # Defer import of runner.py, which imports a lot from Rich

        if name is None and self._name is None:
            raise InvalidError(
                "You need to either supply a deployment name or have a name set on the app.\n"
                "\n"
                "Examples:\n"
                'app.deploy(name="some-name")\n\n'
                "or\n"
                'app = modal.App("some-name")'
            )
        result = await _deploy_app(self, name=name, environment_name=environment_name, tag=tag, client=client)
        self._app_id = result.app_id
        return self

    def _get_default_image(self):
        local_state = self._local_state
        if local_state.image_default:
            return local_state.image_default
        else:
            return _default_image

    def _get_watch_mounts(self):
        if not self._running_app:
            raise ExecutionError("`_get_watch_mounts` requires a running app.")

        all_mounts = []
        for function in self.registered_functions.values():
            all_mounts.extend(function._serve_mounts)

        return [m for m in all_mounts if m.is_local()]

    def _add_function(self, function: _Function, is_web_endpoint: bool):
        local_state = self._local_state
        if old_function := local_state.functions.get(function.tag, None):
            if old_function is function:
                return  # already added the same exact instance, ignore

            # In a notebook or interactive REPL it would be relatively normal to rerun a cell that
            # registers a function multiple times (i.e. as you iterate on the Function definition),
            # and we don't want to warn about a collision in that case.
            if not is_interactive_ipython():
                logger.warning(
                    f"Warning: function name '{function.tag}' collision!"
                    " Overriding existing function "
                    f"[{old_function._info.module_name}].{old_function._info.function_name}"
                    f" with new function [{function._info.module_name}].{function._info.function_name}"
                )
        if function.tag in local_state.classes:
            logger.warning(f"Warning: tag {function.tag} exists but is overridden by function")

        if self._running_app:
            # If this is inside a container, then objects can be defined after app initialization.
            # So we may have to initialize objects once they get bound to the app.
            if function.tag in self._running_app.function_ids:
                object_id: str = self._running_app.function_ids[function.tag]
                metadata: Message = self._running_app.object_handle_metadata[object_id]
                function._hydrate(object_id, self._client, metadata)

        local_state.functions[function.tag] = function
        if is_web_endpoint:
            local_state.web_endpoints.append(function.tag)

    def _add_class(self, tag: str, cls: _Cls):
        if self._running_app:
            # If this is inside a container, then objects can be defined after app initialization.
            # So we may have to initialize objects once they get bound to the app.
            if tag in self._running_app.class_ids:
                object_id: str = self._running_app.class_ids[tag]
                metadata: Message = self._running_app.object_handle_metadata[object_id]
                cls._hydrate(object_id, self._client, metadata)

        self._local_state.classes[tag] = cls

    def _init_container(self, client: _Client, running_app: RunningApp):
        self._app_id = running_app.app_id
        self._running_app = running_app
        self._client = client

        _App._container_app = self
        local_state = self._local_state
        # Hydrate function objects
        for tag, object_id in running_app.function_ids.items():
            if tag in local_state.functions:
                obj = local_state.functions[tag]
                handle_metadata = running_app.object_handle_metadata[object_id]
                obj._hydrate(object_id, client, handle_metadata)

        # Hydrate class objects
        for tag, object_id in running_app.class_ids.items():
            if tag in local_state.classes:
                obj = local_state.classes[tag]
                handle_metadata = running_app.object_handle_metadata[object_id]
                obj._hydrate(object_id, client, handle_metadata)

    @property
    def registered_functions(self) -> dict[str, _Function]:
        """mdmd:hidden
        All modal.Function objects registered on the app.

        Note: this property is populated only during the build phase, and it is not
        expected to work when a deplyoed App has been retrieved via `modal.App.lookup`.
        This method is likely to be deprecated in the future in favor of a different
        approach for retrieving the layout of a deployed App.
        """
        return self._local_state.functions

    @property
    def registered_classes(self) -> dict[str, _Cls]:
        """mdmd:hidden
        All modal.Cls objects registered on the app.

        Note: this property is populated only during the build phase, and it is not
        expected to work when a deplyoed App has been retrieved via `modal.App.lookup`.
        This method is likely to be deprecated in the future in favor of a different
        approach for retrieving the layout of a deployed App.
        """
        return self._local_state.classes

    @property
    def registered_entrypoints(self) -> dict[str, _LocalEntrypoint]:
        """mdmd:hidden
        All local CLI entrypoints registered on the app.

        Note: this property is populated only during the build phase, and it is not
        expected to work when a deplyoed App has been retrieved via `modal.App.lookup`.
        This method is likely to be deprecated in the future.
        """
        return self._local_state.local_entrypoints

    @property
    def registered_web_endpoints(self) -> list[str]:
        """mdmd:hidden
        Names of web endpoint (ie. webhook) functions registered on the app.

        Note: this property is populated only during the build phase, and it is not
        expected to work when a deplyoed App has been retrieved via `modal.App.lookup`.
        This method is likely to be deprecated in the future in favor of a different
        approach for retrieving the layout of a deployed App.
        """
        return self._local_state.web_endpoints

    def local_entrypoint(
        self, _warn_parentheses_missing: Any = None, *, name: Optional[str] = None
    ) -> Callable[[Callable[..., Any]], _LocalEntrypoint]:
        """Decorate a function to be used as a CLI entrypoint for a Modal App.

        These functions can be used to define code that runs locally to set up the app,
        and act as an entrypoint to start Modal functions from. Note that regular
        Modal functions can also be used as CLI entrypoints, but unlike `local_entrypoint`,
        those functions are executed remotely directly.

        **Example**

        ```python
        @app.local_entrypoint()
        def main():
            some_modal_function.remote()
        ```

        You can call the function using `modal run` directly from the CLI:

        ```shell
        modal run app_module.py
        ```

        Note that an explicit [`app.run()`](https://modal.com/docs/reference/modal.App#run) is not needed, as an
        [app](https://modal.com/docs/guide/apps) is automatically created for you.

        **Multiple Entrypoints**

        If you have multiple `local_entrypoint` functions, you can qualify the name of your app and function:

        ```shell
        modal run app_module.py::app.some_other_function
        ```

        **Parsing Arguments**

        If your entrypoint function take arguments with primitive types, `modal run` automatically parses them as
        CLI options.
        For example, the following function can be called with `modal run app_module.py --foo 1 --bar "hello"`:

        ```python
        @app.local_entrypoint()
        def main(foo: int, bar: str):
            some_modal_function.call(foo, bar)
        ```

        Currently, `str`, `int`, `float`, `bool`, and `datetime.datetime` are supported.
        Use `modal run app_module.py --help` for more information on usage.

        """
        if _warn_parentheses_missing:
            raise InvalidError("Did you forget parentheses? Suggestion: `@app.local_entrypoint()`.")
        if name is not None and not isinstance(name, str):
            raise InvalidError("Invalid value for `name`: Must be string.")

        def wrapped(raw_f: Callable[..., Any]) -> _LocalEntrypoint:
            info = FunctionInfo(raw_f)
            tag = name if name is not None else raw_f.__qualname__
            local_state = self._local_state
            if tag in local_state.local_entrypoints:
                # TODO: get rid of this limitation.
                raise InvalidError(f"Duplicate local entrypoint name: {tag}. Local entrypoint names must be unique.")
            entrypoint = local_state.local_entrypoints[tag] = _LocalEntrypoint(info, self)
            return entrypoint

        return wrapped

    @warn_on_renamed_autoscaler_settings
    def function(
        self,
        _warn_parentheses_missing=None,  # mdmd:line-hidden
        *,
        image: Optional[_Image] = None,  # The image to run as the container for the function
        schedule: Optional[Schedule] = None,  # An optional Modal Schedule for the function
        env: Optional[dict[str, Optional[str]]] = None,  # Environment variables to set in the container
        secrets: Optional[Collection[_Secret]] = None,  # Secrets to inject into the container as environment variables
        gpu: Union[GPU_T, list[GPU_T]] = None,  # GPU request; either a single GPU type or a list of types
        serialized: bool = False,  # Whether to send the function over using cloudpickle.
        network_file_systems: dict[
            Union[str, PurePosixPath], _NetworkFileSystem
        ] = {},  # Mountpoints for Modal NetworkFileSystems
        volumes: dict[
            Union[str, PurePosixPath], Union[_Volume, _CloudBucketMount]
        ] = {},  # Mount points for Modal Volumes & CloudBucketMounts
        # Specify, in fractional CPU cores, how many CPU cores to request.
        # Or, pass (request, limit) to additionally specify a hard limit in fractional CPU cores.
        # CPU throttling will prevent a container from exceeding its specified limit.
        cpu: Optional[Union[float, tuple[float, float]]] = None,
        # Specify, in MiB, a memory request which is the minimum memory required.
        # Or, pass (request, limit) to additionally specify a hard limit in MiB.
        memory: Optional[Union[int, tuple[int, int]]] = None,
        ephemeral_disk: Optional[int] = None,  # Specify, in MiB, the ephemeral disk size for the Function.
        min_containers: Optional[int] = None,  # Minimum number of containers to keep warm, even when Function is idle.
        max_containers: Optional[int] = None,  # Limit on the number of containers that can be concurrently running.
        buffer_containers: Optional[int] = None,  # Number of additional idle containers to maintain under active load.
        scaledown_window: Optional[int] = None,  # Max time (in seconds) a container can remain idle while scaling down.
        proxy: Optional[_Proxy] = None,  # Reference to a Modal Proxy to use in front of this function.
        retries: Optional[Union[int, Retries]] = None,  # Number of times to retry each input in case of failure.
        timeout: int = 300,  # Maximum execution time for inputs and startup time in seconds.
        startup_timeout: Optional[int] = None,  # Maximum startup time in seconds with higher precedence than `timeout`.
        name: Optional[str] = None,  # Sets the Modal name of the function within the app
        is_generator: Optional[
            bool
        ] = None,  # Set this to True if it's a non-generator function returning a [sync/async] generator object
        cloud: Optional[str] = None,  # Cloud provider to run the function on. Possible values are aws, gcp, oci, auto.
        region: Optional[Union[str, Sequence[str]]] = None,  # Region or regions to run the function on.
        nonpreemptible: bool = False,  # Whether to run the function on a nonpreemptible instance.
        enable_memory_snapshot: bool = False,  # Enable memory checkpointing for faster cold starts.
        block_network: bool = False,  # Whether to block network access
        restrict_modal_access: bool = False,  # Whether to allow this function access to other Modal resources
        single_use_containers: bool = False,  # When True, containers will shut down after handling a single input
        i6pn: Optional[bool] = None,  # Whether to enable IPv6 container networking within the region.
        # Whether the file or directory containing the Function's source should automatically be included
        # in the container. When unset, falls back to the App-level configuration, or is otherwise True by default.
        include_source: Optional[bool] = None,
        experimental_options: Optional[dict[str, Any]] = None,
        # Parameters below here are experimental. Use with caution!
        _experimental_proxy_ip: Optional[str] = None,  # IP address of proxy
        _experimental_custom_scaling_factor: Optional[float] = None,  # Custom scaling factor
        _experimental_restrict_output: bool = False,  # Don't use pickle for return values
        # Parameters below here are deprecated. Please update your code as suggested
        keep_warm: Optional[int] = None,  # Replaced with `min_containers`
        concurrency_limit: Optional[int] = None,  # Replaced with `max_containers`
        container_idle_timeout: Optional[int] = None,  # Replaced with `scaledown_window`
        allow_concurrent_inputs: Optional[int] = None,  # Replaced with the `@modal.concurrent` decorator
        max_inputs: Optional[int] = None,  # Replaced with `single_use_containers`
        _experimental_buffer_containers: Optional[int] = None,  # Now stable API with `buffer_containers`
        _experimental_scheduler_placement: Optional[SchedulerPlacement] = None,  # Replaced in favor of
        # using `region` and `nonpreemptible`
    ) -> _FunctionDecoratorType:
        """Decorator to register a new Modal Function with this App."""
        if isinstance(_warn_parentheses_missing, _Image):
            # Handle edge case where maybe (?) some users passed image as a positional arg
            raise InvalidError("`image` needs to be a keyword argument: `@app.function(image=image)`.")
        if _warn_parentheses_missing:
            raise InvalidError("Did you forget parentheses? Suggestion: `@app.function()`.")

        if image is None:
            image = self._get_default_image()

        if allow_concurrent_inputs is not None:
            deprecation_warning(
                (2025, 4, 9),
                "The `allow_concurrent_inputs` parameter is deprecated."
                " Please use the `@modal.concurrent` decorator instead."
                "\n\nSee https://modal.com/docs/guide/modal-1-0-migration for more information.",
            )

        if max_inputs is not None:
            if not isinstance(max_inputs, int):
                raise InvalidError(f"`max_inputs` must be an int, not {type(max_inputs).__name__}")
            if max_inputs <= 0:
                raise InvalidError("`max_inputs` must be positive")
            if max_inputs > 1:
                raise InvalidError("Only `max_inputs=1` is currently supported")
            deprecation_warning(
                (2025, 12, 16),
                "The `max_inputs` parameter is deprecated. Please set `single_use_containers=True` instead.",
                pending=True,
            )
            single_use_containers = max_inputs == 1

        if _experimental_scheduler_placement is not None:
            deprecation_warning(
                (2025, 11, 17),
                "The `_experimental_scheduler_placement` parameter is deprecated."
                " Please use the `region` and `nonpreemptible` parameters instead.",
            )
            if region is not None or nonpreemptible:
                raise InvalidError(
                    "Cannot use `_experimental_scheduler_placement` together with "
                    "`region` or `nonpreemptible` parameters."
                )
            # Extract regions and lifecycle from scheduler placement
            if _experimental_scheduler_placement.proto.regions:
                region = list(_experimental_scheduler_placement.proto.regions)
            if _experimental_scheduler_placement.proto._lifecycle:
                # Convert lifecycle to nonpreemptible: "on-demand" -> True, "spot" -> False
                nonpreemptible = _experimental_scheduler_placement.proto._lifecycle == "on-demand"

        secrets = secrets or []
        if env:
            secrets = [*secrets, _Secret.from_dict(env)]
        local_state = self._local_state
        secrets = [*local_state.secrets_default, *secrets]

        def wrapped(
            f: Union[_PartialFunction, Callable[..., Any], None],
        ) -> _Function:
            nonlocal is_generator, cloud, serialized, region, nonpreemptible

            # Check if the decorated object is a class
            if inspect.isclass(f):
                raise TypeError(
                    "The `@app.function` decorator cannot be used on a class. Please use `@app.cls` instead."
                )

            if isinstance(f, _PartialFunction):
                # typically for @function-wrapped @web_endpoint, @asgi_app, or @batched

                # but we don't support @app.function wrapping a method.
                if is_method_fn(f.raw_f.__qualname__):
                    raise InvalidError(
                        "The `@app.function` decorator cannot be used on class methods. "
                        "Swap with `@modal.method` or one of the web endpoint decorators. "
                        "Example: "
                        "\n\n"
                        "```python\n"
                        "@app.cls()\n"
                        "class MyClass:\n"
                        "    @modal.method()\n"
                        "    def f(self, x):\n"
                        "        ...\n"
                        "```\n"
                    )
                i6pn_enabled = i6pn or (f.flags & _PartialFunctionFlags.CLUSTERED)
                cluster_size = f.params.cluster_size  # Experimental: Clustered functions
                rdma = f.params.rdma

                info = FunctionInfo(f.raw_f, serialized=serialized, name_override=name)
                raw_f = f.raw_f
                webhook_config = f.params.webhook_config
                is_generator = f.params.is_generator
                batch_max_size = f.params.batch_max_size
                batch_wait_ms = f.params.batch_wait_ms
                if f.flags & _PartialFunctionFlags.CONCURRENT:
                    verify_concurrent_params(params=f.params, is_flash=is_flash_object(experimental_options, None))
                    max_concurrent_inputs = f.params.max_concurrent_inputs
                    target_concurrent_inputs = f.params.target_concurrent_inputs
                else:
                    max_concurrent_inputs = allow_concurrent_inputs
                    target_concurrent_inputs = None
            else:
                if not is_global_object(f.__qualname__) and not serialized:
                    raise InvalidError(
                        dedent(
                            """
                            The `@app.function` decorator must apply to functions in global scope,
                            unless `serialized=True` is set.
                            If trying to apply additional decorators, they may need to use `functools.wraps`.
                            """
                        )
                    )

                if is_method_fn(f.__qualname__):
                    raise InvalidError(
                        dedent(
                            """
                            The `@app.function` decorator cannot be used on class methods.
                            Please use `@app.cls` with `@modal.method` instead. Example:

                            ```python
                            @app.cls()
                            class MyClass:
                                @modal.method()
                                def f(self, x):
                                    ...
                            ```
                            """
                        )
                    )

                info = FunctionInfo(f, serialized=serialized, name_override=name)
                raw_f = f
                webhook_config = None
                batch_max_size = None
                batch_wait_ms = None
                max_concurrent_inputs = allow_concurrent_inputs
                target_concurrent_inputs = None

                cluster_size = None  # Experimental: Clustered functions
                rdma = None
                i6pn_enabled = i6pn

            if is_generator is None:
                is_generator = inspect.isgeneratorfunction(raw_f) or inspect.isasyncgenfunction(raw_f)

            function = _Function.from_local(
                info,
                app=self,
                image=image,
                secrets=secrets,
                schedule=schedule,
                is_generator=is_generator,
                gpu=gpu,
                network_file_systems=network_file_systems,
                volumes={**local_state.volumes_default, **volumes},
                cpu=cpu,
                memory=memory,
                ephemeral_disk=ephemeral_disk,
                proxy=proxy,
                retries=retries,
                min_containers=min_containers,
                max_containers=max_containers,
                buffer_containers=buffer_containers,
                scaledown_window=scaledown_window,
                max_concurrent_inputs=max_concurrent_inputs,
                target_concurrent_inputs=target_concurrent_inputs,
                batch_max_size=batch_max_size,
                batch_wait_ms=batch_wait_ms,
                timeout=timeout,
                startup_timeout=startup_timeout or timeout,
                cloud=cloud,
                region=region,
                nonpreemptible=nonpreemptible,
                webhook_config=webhook_config,
                enable_memory_snapshot=enable_memory_snapshot,
                block_network=block_network,
                restrict_modal_access=restrict_modal_access,
                single_use_containers=single_use_containers,
                i6pn_enabled=i6pn_enabled,
                cluster_size=cluster_size,  # Experimental: Clustered functions
                rdma=rdma,
                include_source=include_source if include_source is not None else local_state.include_source_default,
                experimental_options={k: str(v) for k, v in (experimental_options or {}).items()},
                _experimental_proxy_ip=_experimental_proxy_ip,
                restrict_output=_experimental_restrict_output,
            )

            self._add_function(function, webhook_config is not None)

            return function

        return wrapped

    @typing_extensions.dataclass_transform(field_specifiers=(parameter,), kw_only_default=True)
    @warn_on_renamed_autoscaler_settings
    def cls(
        self,
        _warn_parentheses_missing=None,  # mdmd:line-hidden
        *,
        image: Optional[_Image] = None,  # The image to run as the container for the function
        env: Optional[dict[str, Optional[str]]] = None,  # Environment variables to set in the container
        secrets: Optional[Collection[_Secret]] = None,  # Secrets to inject into the container as environment variables
        gpu: Union[GPU_T, list[GPU_T]] = None,  # GPU request; either a single GPU type or a list of types
        serialized: bool = False,  # Whether to send the function over using cloudpickle.
        network_file_systems: dict[
            Union[str, PurePosixPath], _NetworkFileSystem
        ] = {},  # Mountpoints for Modal NetworkFileSystems
        volumes: dict[
            Union[str, PurePosixPath], Union[_Volume, _CloudBucketMount]
        ] = {},  # Mount points for Modal Volumes & CloudBucketMounts
        # Specify, in fractional CPU cores, how many CPU cores to request.
        # Or, pass (request, limit) to additionally specify a hard limit in fractional CPU cores.
        # CPU throttling will prevent a container from exceeding its specified limit.
        cpu: Optional[Union[float, tuple[float, float]]] = None,
        # Specify, in MiB, a memory request which is the minimum memory required.
        # Or, pass (request, limit) to additionally specify a hard limit in MiB.
        memory: Optional[Union[int, tuple[int, int]]] = None,
        ephemeral_disk: Optional[int] = None,  # Specify, in MiB, the ephemeral disk size for the Function.
        min_containers: Optional[int] = None,  # Minimum number of containers to keep warm, even when Function is idle.
        max_containers: Optional[int] = None,  # Limit on the number of containers that can be concurrently running.
        buffer_containers: Optional[int] = None,  # Number of additional idle containers to maintain under active load.
        scaledown_window: Optional[int] = None,  # Max time (in seconds) a container can remain idle while scaling down.
        proxy: Optional[_Proxy] = None,  # Reference to a Modal Proxy to use in front of this function.
        retries: Optional[Union[int, Retries]] = None,  # Number of times to retry each input in case of failure.
        timeout: int = 300,  # Maximum execution time for inputs and startup time in seconds.
        startup_timeout: Optional[int] = None,  # Maximum startup time in seconds with higher precedence than `timeout`.
        cloud: Optional[str] = None,  # Cloud provider to run the function on. Possible values are aws, gcp, oci, auto.
        region: Optional[Union[str, Sequence[str]]] = None,  # Region or regions to run the function on.
        nonpreemptible: bool = False,  # Whether to run the function on a non-preemptible instance.
        enable_memory_snapshot: bool = False,  # Enable memory checkpointing for faster cold starts.
        block_network: bool = False,  # Whether to block network access
        restrict_modal_access: bool = False,  # Whether to allow this class access to other Modal resources
        single_use_containers: bool = False,  # When True, containers will shut down after handling a single input
        i6pn: Optional[bool] = None,  # Whether to enable IPv6 container networking within the region.
        include_source: Optional[bool] = None,  # When `False`, don't automatically add the App source to the container.
        experimental_options: Optional[dict[str, Any]] = None,
        # Parameters below here are experimental. Use with caution!
        _experimental_proxy_ip: Optional[str] = None,  # IP address of proxy
        _experimental_custom_scaling_factor: Optional[float] = None,  # Custom scaling factor
        _experimental_restrict_output: bool = False,  # Don't use pickle for return values
        # Parameters below here are deprecated. Please update your code as suggested
        keep_warm: Optional[int] = None,  # Replaced with `min_containers`
        concurrency_limit: Optional[int] = None,  # Replaced with `max_containers`
        container_idle_timeout: Optional[int] = None,  # Replaced with `scaledown_window`
        allow_concurrent_inputs: Optional[int] = None,  # Replaced with the `@modal.concurrent` decorator
        max_inputs: Optional[int] = None,  # Replaced with `single_use_containers`
        _experimental_buffer_containers: Optional[int] = None,  # Now stable API with `buffer_containers`
        _experimental_scheduler_placement: Optional[SchedulerPlacement] = None,  # Replaced in favor of
        # using `region` and `nonpreemptible`
    ) -> Callable[[Union[CLS_T, _PartialFunction]], CLS_T]:
        """
        Decorator to register a new Modal [Cls](https://modal.com/docs/reference/modal.Cls) with this App.
        """
        if _warn_parentheses_missing:
            raise InvalidError("Did you forget parentheses? Suggestion: `@app.cls()`.")

        if allow_concurrent_inputs is not None:
            deprecation_warning(
                (2025, 4, 9),
                "The `allow_concurrent_inputs` parameter is deprecated."
                " Please use the `@modal.concurrent` decorator instead."
                "\n\nSee https://modal.com/docs/guide/modal-1-0-migration for more information.",
            )

        if max_inputs is not None:
            if not isinstance(max_inputs, int):
                raise InvalidError(f"`max_inputs` must be an int, not {type(max_inputs).__name__}")
            if max_inputs <= 0:
                raise InvalidError("`max_inputs` must be positive")
            if max_inputs > 1:
                raise InvalidError("Only `max_inputs=1` is currently supported")
            deprecation_warning(
                (2025, 12, 16),
                "The `max_inputs` parameter is deprecated. Please set `single_use_containers=True` instead.",
                pending=True,
            )
            single_use_containers = max_inputs == 1

        if _experimental_scheduler_placement is not None:
            deprecation_warning(
                (2025, 11, 17),
                "The `_experimental_scheduler_placement` parameter is deprecated."
                " Please use the `region` and `nonpreemptible` parameters instead.",
            )
            if region is not None or nonpreemptible:
                raise InvalidError(
                    "Cannot use `_experimental_scheduler_placement` together with "
                    "`region` or `nonpreemptible` parameters."
                )
            # Extract regions and lifecycle from scheduler placement
            if _experimental_scheduler_placement.proto.regions:
                region = list(_experimental_scheduler_placement.proto.regions)
            if _experimental_scheduler_placement.proto._lifecycle:
                # Convert lifecycle to nonpreemptible: "on-demand" -> True, "spot" -> False
                nonpreemptible = _experimental_scheduler_placement.proto._lifecycle == "on-demand"

        secrets = secrets or []
        if env:
            secrets = [*secrets, _Secret.from_dict(env)]

        def wrapper(wrapped_cls: Union[CLS_T, _PartialFunction]) -> CLS_T:
            local_state = self._local_state
            # Check if the decorated object is a class
            http_config = None
            if isinstance(wrapped_cls, _PartialFunction):
                user_cls = wrapped_cls.user_cls
                if wrapped_cls.flags & _PartialFunctionFlags.HTTP_WEB_INTERFACE:
                    http_config = wrapped_cls.params.http_config
                if wrapped_cls.flags & _PartialFunctionFlags.CONCURRENT:
                    verify_concurrent_params(
                        params=wrapped_cls.params,
                        is_flash=is_flash_object(experimental_options or {}, http_config=http_config),
                    )
                    max_concurrent_inputs = wrapped_cls.params.max_concurrent_inputs
                    target_concurrent_inputs = wrapped_cls.params.target_concurrent_inputs
                else:
                    max_concurrent_inputs = allow_concurrent_inputs
                    target_concurrent_inputs = None

                if wrapped_cls.flags & _PartialFunctionFlags.CLUSTERED:
                    cluster_size = wrapped_cls.params.cluster_size
                    rdma = wrapped_cls.params.rdma

                else:
                    cluster_size = None
                    rdma = None
            else:
                user_cls = wrapped_cls
                max_concurrent_inputs = allow_concurrent_inputs
                target_concurrent_inputs = None
                cluster_size = None
                rdma = None
            if not inspect.isclass(user_cls):
                raise TypeError("The @app.cls decorator must be used on a class.")

            interface_methods = _find_partial_methods_for_user_cls(user_cls, _PartialFunctionFlags.interface_flags())
            if cluster_size:
                if len(interface_methods) > 1:
                    raise InvalidError(f"Modal class {user_cls.__name__} cannot have multiple methods when clustered.")

            batch_functions = _find_partial_methods_for_user_cls(user_cls, _PartialFunctionFlags.BATCHED)
            if batch_functions:
                if len(batch_functions) > 1:
                    raise InvalidError(f"Modal class {user_cls.__name__} can only have one batched function.")
                if len(_find_partial_methods_for_user_cls(user_cls, _PartialFunctionFlags.interface_flags())) > 1:
                    raise InvalidError(
                        f"Modal class {user_cls.__name__} with a modal batched function cannot have other modal methods."  # noqa
                    )
                batch_function = next(iter(batch_functions.values()))
                batch_max_size = batch_function.params.batch_max_size
                batch_wait_ms = batch_function.params.batch_wait_ms
            else:
                batch_max_size = None
                batch_wait_ms = None

            if (
                _find_partial_methods_for_user_cls(user_cls, _PartialFunctionFlags.ENTER_PRE_SNAPSHOT)
                and not enable_memory_snapshot
            ):
                raise InvalidError("A class must have `enable_memory_snapshot=True` to use `snap=True` on its methods.")

            for method in _find_partial_methods_for_user_cls(user_cls, _PartialFunctionFlags.CONCURRENT).values():
                raise InvalidError(
                    "The `@modal.concurrent` decorator cannot be used on methods; decorate the class instead."
                )

            for method in _find_partial_methods_for_user_cls(
                user_cls, _PartialFunctionFlags.HTTP_WEB_INTERFACE
            ).values():
                raise InvalidError(
                    "The `@modal.http_server` decorator cannot be used on methods; decorate the class instead."
                )

            if http_config is not None:
                for method in _find_partial_methods_for_user_cls(
                    user_cls, _PartialFunctionFlags.CALLABLE_INTERFACE
                ).values():
                    raise InvalidError("Callable decorators cannot be combined with web interface decorators.")

            info = FunctionInfo(None, serialized=serialized, user_cls=user_cls)

            i6pn_enabled = i6pn or cluster_size is not None
            cls_func = _Function.from_local(
                info,
                app=self,
                image=image or self._get_default_image(),
                secrets=[*local_state.secrets_default, *secrets],
                gpu=gpu,
                network_file_systems=network_file_systems,
                volumes={**local_state.volumes_default, **volumes},
                cpu=cpu,
                memory=memory,
                ephemeral_disk=ephemeral_disk,
                min_containers=min_containers,
                max_containers=max_containers,
                buffer_containers=buffer_containers,
                scaledown_window=scaledown_window,
                proxy=proxy,
                retries=retries,
                max_concurrent_inputs=max_concurrent_inputs,
                target_concurrent_inputs=target_concurrent_inputs,
                batch_max_size=batch_max_size,
                batch_wait_ms=batch_wait_ms,
                timeout=timeout,
                startup_timeout=startup_timeout or timeout,
                cloud=cloud,
                region=region,
                nonpreemptible=nonpreemptible,
                enable_memory_snapshot=enable_memory_snapshot,
                block_network=block_network,
                restrict_modal_access=restrict_modal_access,
                single_use_containers=single_use_containers,
                http_config=http_config,
                i6pn_enabled=i6pn_enabled,
                cluster_size=cluster_size,
                rdma=rdma,
                include_source=include_source if include_source is not None else local_state.include_source_default,
                experimental_options={k: str(v) for k, v in (experimental_options or {}).items()},
                _experimental_proxy_ip=_experimental_proxy_ip,
                _experimental_custom_scaling_factor=_experimental_custom_scaling_factor,
                restrict_output=_experimental_restrict_output,
            )

            self._add_function(cls_func, is_web_endpoint=False)

            cls: _Cls = _Cls.from_local(user_cls, self, cls_func)

            for method_name, partial_function in cls._method_partials.items():
                if partial_function.params.webhook_config is not None:
                    full_name = f"{user_cls.__name__}.{method_name}"
                    local_state.web_endpoints.append(full_name)

            tag: str = user_cls.__name__
            self._add_class(tag, cls)
            return cls  # type: ignore  # a _Cls instance "simulates" being the user provided class

        return wrapper

    def _experimental_server(
        self,
        _warn_parentheses_missing=None,  # mdmd:line-hidden
        *,
        image: Optional[_Image] = None,  # The image to run as the container for the server
        env: Optional[dict[str, Optional[str]]] = None,  # Environment variables to set in the container
        secrets: Optional[Collection[_Secret]] = None,  # Secrets to inject into the container as environment variables
        gpu: Union[GPU_T, list[GPU_T]] = None,  # GPU request; either a single GPU type or a list of types
        serialized: bool = False,  # Whether to send the server class over using cloudpickle.
        volumes: dict[
            Union[str, PurePosixPath], Union[_Volume, _CloudBucketMount]
        ] = {},  # Mount points for Modal Volumes & CloudBucketMounts
        cpu: Optional[Union[float, tuple[float, float]]] = None,  # CPU cores to request
        memory: Optional[Union[int, tuple[int, int]]] = None,  # Memory in MiB to request
        ephemeral_disk: Optional[int] = None,  # Ephemeral disk size in MiB
        min_containers: Optional[int] = None,  # Minimum number of containers to keep warm
        max_containers: Optional[int] = None,  # Maximum number of containers
        buffer_containers: Optional[int] = None,  # Additional idle containers under active load
        scaledown_window: Optional[int] = None,  # Max idle time before scaling down (seconds)
        proxy: Optional[_Proxy] = None,  # Modal Proxy to use in front of this server
        port: int = 8000,  # Port the HTTP server listens on
        startup_timeout: int = 30,  # Maximum startup time in seconds
        exit_grace_period: int = 0,  # Grace period for in-flight requests on shutdown
        proxy_regions: Optional[Sequence[str]] = ["us-east"],  # Required: Regions to deploy proxy endpoints
        h2_enabled: bool = False,  # Enable HTTP/2
        target_concurrency: Optional[int] = None,  # Target concurrency for the server
        cloud: Optional[str] = None,  # Cloud provider (aws, gcp, oci, auto)
        region: Optional[Union[str, Sequence[str]]] = None,  # Region(s) to run on
        nonpreemptible: bool = False,  # Whether to use non-preemptible instances
        enable_memory_snapshot: bool = False,  # Enable memory checkpointing
        i6pn: Optional[bool] = None,  # Enable IPv6 container networking
        include_source: Optional[bool] = None,  # Whether to add source to container
        # Experimental options
        experimental_options: Optional[dict[str, Any]] = None,
    ) -> Callable[[Union[CLS_T, _PartialFunction]], _Server]:
        """
        Decorator to register a new Modal Server with this App.

        Servers run HTTP servers that are started in an `@enter` method.
        Unlike `@app.cls()`, servers only expose HTTP endpoints and do not
        support `.remote()` method calls.

        Example:

        ```python
        @app._experimental_server(port=8000, proxy_regions=["us-east"])
        class MyServer:
            @modal.enter()
            def start(self):
                self.proc = subprocess.Popen(["python3", "-m", "http.server", "8000"])

            @modal.exit()
            def stop(self):
                self.proc.terminate()
        ```
        """
        if _warn_parentheses_missing:
            raise InvalidError("Did you forget parentheses? Suggestion: `@app._experimental_server()`.")

        # Validate HTTP server config
        validate_http_server_config(
            port=port,
            proxy_regions=proxy_regions,
            startup_timeout=startup_timeout,
            exit_grace_period=exit_grace_period,
        )

        if target_concurrency is not None:
            if not isinstance(target_concurrency, int) or target_concurrency < 1:
                raise InvalidError("The `target_concurrency` argument must be a positive integer.")

        http_config = api_pb2.HTTPConfig(
            port=port,
            proxy_regions=proxy_regions,
            startup_timeout=startup_timeout,
            exit_grace_period=exit_grace_period,
            h2_enabled=h2_enabled,
        )

        # Build secrets list
        secrets_list: list[_Secret] = list(secrets) if secrets else []
        if env:
            secrets_list.append(_Secret.from_dict(env))

        def wrapper(wrapped_user_cls: Union[CLS_T, _PartialFunction, Callable]) -> _Server:
            _Server._validate_wrapped_user_cls_decorators(wrapped_user_cls, enable_memory_snapshot)

            # Validate the server class
            _Server._validate_construction_mechanism(wrapped_user_cls)

            # Extract the underlying class if wrapped in a _PartialFunction (e.g., from @modal.clustered())
            cluster_size = None
            rdma = None
            user_cls = wrapped_user_cls

            if isinstance(wrapped_user_cls, _PartialFunction):
                user_cls = wrapped_user_cls.user_cls
                if wrapped_user_cls.flags & _PartialFunctionFlags.CLUSTERED:
                    cluster_size = wrapped_user_cls.params.cluster_size
                    rdma = wrapped_user_cls.params.rdma

            local_state = self._local_state

            # Create the FunctionInfo for the server, note we treat FunctionInfo as a class for servers
            info = FunctionInfo(None, serialized=serialized, user_cls=user_cls, name_override=user_cls.__name__)
            # Create the service function
            service_function = _Function.from_local(
                info,
                app=self,
                image=image or self._get_default_image(),
                secrets=[*local_state.secrets_default, *secrets_list],
                gpu=gpu,
                network_file_systems={},  # Deprecated: No support for Server level network file systems
                volumes={**local_state.volumes_default, **volumes},
                cpu=cpu,
                memory=memory,
                ephemeral_disk=ephemeral_disk,
                min_containers=min_containers,
                max_containers=max_containers,
                buffer_containers=buffer_containers,
                scaledown_window=scaledown_window,
                proxy=proxy,
                retries=None,  # No support for Server level retries
                max_concurrent_inputs=None,  # No support for Server level concurrent inputs
                target_concurrent_inputs=target_concurrency,  # No support for Server level concurrent inputs
                batch_max_size=None,  # No support for Server level batching
                batch_wait_ms=None,  # No support for Server level batching
                startup_timeout=startup_timeout,
                cloud=cloud,
                region=region,
                nonpreemptible=nonpreemptible,
                enable_memory_snapshot=enable_memory_snapshot,
                single_use_containers=False,  # No support for single-use server containers
                http_config=http_config,
                is_server=True,
                i6pn_enabled=i6pn or (cluster_size is not None),
                cluster_size=cluster_size,
                rdma=rdma,
                include_source=include_source if include_source is not None else local_state.include_source_default,
                experimental_options={k: str(v) for k, v in (experimental_options or {}).items()},
                restrict_output=False,
            )

            self._add_function(service_function, is_web_endpoint=False)
            server: _Server = _Server._from_local(wrapped_user_cls, self, service_function)
            return server

        return wrapper

    def include(self, /, other_app: "_App", inherit_tags: bool = True) -> typing_extensions.Self:
        """Include another App's objects in this one.

        Useful for splitting up Modal Apps across different self-contained files.

        ```python
        app_a = modal.App("a")
        @app.function()
        def foo():
            ...

        app_b = modal.App("b")
        @app.function()
        def bar():
            ...

        app_a.include(app_b)

        @app_a.local_entrypoint()
        def main():
            # use function declared on the included app
            bar.remote()
        ```

        When `inherit_tags=True` any tags set on the other App will be inherited by this App
        (with this App's tags taking precedence in the case of conflicts).

        """
        other_app_local_state = other_app._local_state
        this_local_state = self._local_state

        for tag, function in other_app_local_state.functions.items():
            self._add_function(function, False)  # TODO(erikbern): webhook config?

        for tag, cls in other_app_local_state.classes.items():
            existing_cls = this_local_state.classes.get(tag)
            if existing_cls and existing_cls != cls:
                logger.warning(
                    f"Named app class {tag} with existing value {existing_cls} is being "
                    f"overwritten by a different class {cls}"
                )

            self._add_class(tag, cls)

        if inherit_tags:
            this_local_state.tags = {**other_app_local_state.tags, **this_local_state.tags}

        return self

    async def set_tags(self, tags: Mapping[str, str], *, client: Optional[_Client] = None) -> None:
        """Attach key-value metadata to the App.

        Tag metadata can be used to add organization-specific context to the App and can be
        included in billing reports and other informational APIs. Tags can also be set in
        the App constructor.

        Any tags set on the App before calling this method will be removed if they are not
        included in the argument (i.e., this method does not have `.update()` semantics).

        """
        # Note that we are requiring the App to be "running" before we set the tags.
        # Alternatively, we could hold onto the tags (i.e. in `self._local_state.tags`) and then pass
        # then up when AppPublish gets called. I'm not certain we want to support it, though.
        # It might not be obvious to users that `.set_tags()` is eager and has immediate effect
        # when the App is running, but lazy (and potentially ignored) otherwise. There would be
        # other complications, like what do you do with any tags set in the constructor, and
        # what should  `.get_tags()` do when it's called before the App is running?
        if self._app_id is None:
            raise InvalidError("`App.set_tags` cannot be called before the App is running.")
        check_tag_dict(tags)
        req = api_pb2.AppSetTagsRequest(app_id=self._app_id, tags=tags)

        client = client or self._client or await _Client.from_env()
        await client.stub.AppSetTags(req)

    async def get_tags(self, *, client: Optional[_Client] = None) -> dict[str, str]:
        """Get the tags that are currently attached to the App."""
        if self._app_id is None:
            raise InvalidError("`App.get_tags` cannot be called before the App is running.")
        req = api_pb2.AppGetTagsRequest(app_id=self._app_id)
        client = client or self._client or await _Client.from_env()
        resp = await client.stub.AppGetTags(req)
        return dict(resp.tags)

    async def _logs(self, client: Optional[_Client] = None) -> AsyncGenerator[str, None]:
        """Stream logs from the app.

        This method is considered private and its interface may change - use at your own risk!
        """
        if not self._app_id:
            raise InvalidError("`app._logs` requires a running/stopped app.")

        client = client or self._client or await _Client.from_env()

        last_log_batch_entry_id: Optional[str] = None
        while True:
            request = api_pb2.AppGetLogsRequest(
                app_id=self._app_id,
                timeout=55,
                last_entry_id=last_log_batch_entry_id,
            )
            async for log_batch in client.stub.AppGetLogs.unary_stream(request):
                if log_batch.entry_id:
                    # log_batch entry_id is empty for fd="server" messages from AppGetLogs
                    last_log_batch_entry_id = log_batch.entry_id
                if log_batch.app_done:
                    return
                for log in log_batch.items:
                    if log.data:
                        yield log.data

    @classmethod
    def _get_container_app(cls) -> Optional["_App"]:
        """Returns the `App` running inside a container.

        This will return `None` outside of a Modal container."""
        return cls._container_app

    @classmethod
    def _reset_container_app(cls):
        """Only used for tests."""
        cls._container_app = None


App = synchronize_api(_App)
