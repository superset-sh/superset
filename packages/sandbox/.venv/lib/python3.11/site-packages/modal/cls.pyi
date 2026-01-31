import collections.abc
import google.protobuf.message
import inspect
import modal._functions
import modal._object
import modal._partial_function
import modal.app
import modal.client
import modal.cloud_bucket_mount
import modal.functions
import modal.gpu
import modal.object
import modal.partial_function
import modal.retries
import modal.secret
import modal.volume
import modal_proto.api_pb2
import pathlib
import typing
import typing_extensions

T = typing.TypeVar("T")

def _use_annotation_parameters(user_cls: type) -> bool: ...
def _get_class_constructor_signature(user_cls: type) -> inspect.Signature: ...

class _ServiceOptions:
    """_ServiceOptions(secrets: collections.abc.Collection[modal.secret._Secret] = (), validated_volumes: Sequence[tuple[str, modal.volume._Volume]] = (), resources: Optional[modal_proto.api_pb2.Resources] = None, retry_policy: Optional[modal_proto.api_pb2.FunctionRetryPolicy] = None, max_containers: Optional[int] = None, buffer_containers: Optional[int] = None, scaledown_window: Optional[int] = None, timeout_secs: Optional[int] = None, max_concurrent_inputs: Optional[int] = None, target_concurrent_inputs: Optional[int] = None, batch_max_size: Optional[int] = None, batch_wait_ms: Optional[int] = None, scheduler_placement: Optional[modal_proto.api_pb2.SchedulerPlacement] = None, cloud: Optional[str] = None, cloud_bucket_mounts: Sequence[tuple[str, modal.cloud_bucket_mount._CloudBucketMount]] = ())"""

    secrets: collections.abc.Collection[modal.secret._Secret]
    validated_volumes: typing.Sequence[tuple[str, modal.volume._Volume]]
    resources: typing.Optional[modal_proto.api_pb2.Resources]
    retry_policy: typing.Optional[modal_proto.api_pb2.FunctionRetryPolicy]
    max_containers: typing.Optional[int]
    buffer_containers: typing.Optional[int]
    scaledown_window: typing.Optional[int]
    timeout_secs: typing.Optional[int]
    max_concurrent_inputs: typing.Optional[int]
    target_concurrent_inputs: typing.Optional[int]
    batch_max_size: typing.Optional[int]
    batch_wait_ms: typing.Optional[int]
    scheduler_placement: typing.Optional[modal_proto.api_pb2.SchedulerPlacement]
    cloud: typing.Optional[str]
    cloud_bucket_mounts: typing.Sequence[tuple[str, modal.cloud_bucket_mount._CloudBucketMount]]

    def merge_options(self, new_options: _ServiceOptions) -> _ServiceOptions:
        """Implement protobuf-like MergeFrom semantics for this dataclass.

        This mostly exists to support "stacking" of `.with_options()` calls.
        Returns a new _ServiceOptions instance without modifying self.
        """
        ...

    def __init__(
        self,
        secrets: collections.abc.Collection[modal.secret._Secret] = (),
        validated_volumes: typing.Sequence[tuple[str, modal.volume._Volume]] = (),
        resources: typing.Optional[modal_proto.api_pb2.Resources] = None,
        retry_policy: typing.Optional[modal_proto.api_pb2.FunctionRetryPolicy] = None,
        max_containers: typing.Optional[int] = None,
        buffer_containers: typing.Optional[int] = None,
        scaledown_window: typing.Optional[int] = None,
        timeout_secs: typing.Optional[int] = None,
        max_concurrent_inputs: typing.Optional[int] = None,
        target_concurrent_inputs: typing.Optional[int] = None,
        batch_max_size: typing.Optional[int] = None,
        batch_wait_ms: typing.Optional[int] = None,
        scheduler_placement: typing.Optional[modal_proto.api_pb2.SchedulerPlacement] = None,
        cloud: typing.Optional[str] = None,
        cloud_bucket_mounts: typing.Sequence[tuple[str, modal.cloud_bucket_mount._CloudBucketMount]] = (),
    ) -> None:
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def __repr__(self):
        """Return repr(self)."""
        ...

    def __eq__(self, other):
        """Return self==value."""
        ...

def _bind_instance_method(cls: _Cls, service_function: modal._functions._Function, method_name: str):
    """Binds an "instance service function" to a specific method using metadata for that method

    This "dummy" _Function gets no unique object_id and isn't backend-backed at all, since all
    it does it forward invocations to the underlying instance_service_function with the specified method
    """
    ...

class _Obj:
    """An instance of a `Cls`, i.e. `Cls("foo", 42)` returns an `Obj`.

    All this class does is to return `Function` objects.
    """

    _cls: _Cls
    _functions: dict[str, modal._functions._Function]
    _has_entered: bool
    _user_cls_instance: typing.Optional[typing.Any]
    _args: tuple[typing.Any, ...]
    _kwargs: dict[str, typing.Any]
    _instance_service_function: typing.Optional[modal._functions._Function]
    _options: typing.Optional[_ServiceOptions]

    def __init__(
        self, cls: _Cls, user_cls: typing.Optional[type], options: typing.Optional[_ServiceOptions], args, kwargs
    ):
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def _cached_service_function(self) -> modal._functions._Function: ...
    def _get_parameter_values(self) -> dict[str, typing.Any]: ...
    def _new_user_cls_instance(self): ...
    async def update_autoscaler(
        self,
        *,
        min_containers: typing.Optional[int] = None,
        max_containers: typing.Optional[int] = None,
        scaledown_window: typing.Optional[int] = None,
        buffer_containers: typing.Optional[int] = None,
    ) -> None:
        """Override the current autoscaler behavior for this Cls instance.

        Unspecified parameters will retain their current value, i.e. either the static value
        from the function decorator, or an override value from a previous call to this method.

        Subsequent deployments of the App containing this Cls will reset the autoscaler back to
        its static configuration.

        Note: When calling this method on a Cls that is defined locally, static type checkers will
        issue an error, because the object will appear to have the user-defined type.

        Examples:

        ```python notest
        Model = modal.Cls.from_name("my-app", "Model")
        model = Model()  # This method is called on an *instance* of the class

        # Always have at least 2 containers running, with an extra buffer when the Function is active
        model.update_autoscaler(min_containers=2, buffer_containers=1)

        # Limit this Function to avoid spinning up more than 5 containers
        f.update_autoscaler(max_containers=5)
        ```
        """
        ...

    async def keep_warm(self, warm_pool_size: int) -> None:
        """mdmd:hidden
        Set the warm pool size for the class containers

        DEPRECATED: Please adapt your code to use the more general `update_autoscaler` method instead:

        ```python notest
        Model = modal.Cls.from_name("my-app", "Model")
        model = Model()  # This method is called on an *instance* of the class

        # Old pattern (deprecated)
        model.keep_warm(2)

        # New pattern
        model.update_autoscaler(min_containers=2)
        ```
        """
        ...

    def _cached_user_cls_instance(self):
        """Get or construct the local object

        Used for .local() calls and getting attributes of classes
        """
        ...

    def _enter(self): ...
    @property
    def _entered(self) -> bool: ...
    @_entered.setter
    def _entered(self, val: bool): ...
    async def _aenter(self): ...
    def __getattr__(self, k): ...

class Obj:
    """An instance of a `Cls`, i.e. `Cls("foo", 42)` returns an `Obj`.

    All this class does is to return `Function` objects.
    """

    _cls: Cls
    _functions: dict[str, modal.functions.Function]
    _has_entered: bool
    _user_cls_instance: typing.Optional[typing.Any]
    _args: tuple[typing.Any, ...]
    _kwargs: dict[str, typing.Any]
    _instance_service_function: typing.Optional[modal.functions.Function]
    _options: typing.Optional[_ServiceOptions]

    def __init__(
        self, cls: Cls, user_cls: typing.Optional[type], options: typing.Optional[_ServiceOptions], args, kwargs
    ): ...
    def _cached_service_function(self) -> modal.functions.Function: ...
    def _get_parameter_values(self) -> dict[str, typing.Any]: ...
    def _new_user_cls_instance(self): ...

    class __update_autoscaler_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            *,
            min_containers: typing.Optional[int] = None,
            max_containers: typing.Optional[int] = None,
            scaledown_window: typing.Optional[int] = None,
            buffer_containers: typing.Optional[int] = None,
        ) -> None:
            """Override the current autoscaler behavior for this Cls instance.

            Unspecified parameters will retain their current value, i.e. either the static value
            from the function decorator, or an override value from a previous call to this method.

            Subsequent deployments of the App containing this Cls will reset the autoscaler back to
            its static configuration.

            Note: When calling this method on a Cls that is defined locally, static type checkers will
            issue an error, because the object will appear to have the user-defined type.

            Examples:

            ```python notest
            Model = modal.Cls.from_name("my-app", "Model")
            model = Model()  # This method is called on an *instance* of the class

            # Always have at least 2 containers running, with an extra buffer when the Function is active
            model.update_autoscaler(min_containers=2, buffer_containers=1)

            # Limit this Function to avoid spinning up more than 5 containers
            f.update_autoscaler(max_containers=5)
            ```
            """
            ...

        async def aio(
            self,
            /,
            *,
            min_containers: typing.Optional[int] = None,
            max_containers: typing.Optional[int] = None,
            scaledown_window: typing.Optional[int] = None,
            buffer_containers: typing.Optional[int] = None,
        ) -> None:
            """Override the current autoscaler behavior for this Cls instance.

            Unspecified parameters will retain their current value, i.e. either the static value
            from the function decorator, or an override value from a previous call to this method.

            Subsequent deployments of the App containing this Cls will reset the autoscaler back to
            its static configuration.

            Note: When calling this method on a Cls that is defined locally, static type checkers will
            issue an error, because the object will appear to have the user-defined type.

            Examples:

            ```python notest
            Model = modal.Cls.from_name("my-app", "Model")
            model = Model()  # This method is called on an *instance* of the class

            # Always have at least 2 containers running, with an extra buffer when the Function is active
            model.update_autoscaler(min_containers=2, buffer_containers=1)

            # Limit this Function to avoid spinning up more than 5 containers
            f.update_autoscaler(max_containers=5)
            ```
            """
            ...

    update_autoscaler: __update_autoscaler_spec

    class __keep_warm_spec(typing_extensions.Protocol):
        def __call__(self, /, warm_pool_size: int) -> None:
            """mdmd:hidden
            Set the warm pool size for the class containers

            DEPRECATED: Please adapt your code to use the more general `update_autoscaler` method instead:

            ```python notest
            Model = modal.Cls.from_name("my-app", "Model")
            model = Model()  # This method is called on an *instance* of the class

            # Old pattern (deprecated)
            model.keep_warm(2)

            # New pattern
            model.update_autoscaler(min_containers=2)
            ```
            """
            ...

        async def aio(self, /, warm_pool_size: int) -> None:
            """mdmd:hidden
            Set the warm pool size for the class containers

            DEPRECATED: Please adapt your code to use the more general `update_autoscaler` method instead:

            ```python notest
            Model = modal.Cls.from_name("my-app", "Model")
            model = Model()  # This method is called on an *instance* of the class

            # Old pattern (deprecated)
            model.keep_warm(2)

            # New pattern
            model.update_autoscaler(min_containers=2)
            ```
            """
            ...

    keep_warm: __keep_warm_spec

    def _cached_user_cls_instance(self):
        """Get or construct the local object

        Used for .local() calls and getting attributes of classes
        """
        ...

    def _enter(self): ...
    @property
    def _entered(self) -> bool: ...
    @_entered.setter
    def _entered(self, val: bool): ...
    async def _aenter(self): ...
    def __getattr__(self, k): ...

class _Cls(modal._object._Object):
    """Cls adds method pooling and [lifecycle hook](https://modal.com/docs/guide/lifecycle-functions) behavior
    to [modal.Function](https://modal.com/docs/reference/modal.Function).

    Generally, you will not construct a Cls directly.
    Instead, use the [`@app.cls()`](https://modal.com/docs/reference/modal.App#cls) decorator on the App object.
    """

    _class_service_function: typing.Optional[modal._functions._Function]
    _options: _ServiceOptions
    _app: typing.Optional[modal.app._App]
    _name: typing.Optional[str]
    _method_metadata: typing.Optional[dict[str, modal_proto.api_pb2.FunctionHandleMetadata]]
    _user_cls: typing.Optional[type]
    _method_partials: typing.Optional[dict[str, modal._partial_function._PartialFunction]]
    _callables: dict[str, collections.abc.Callable[..., typing.Any]]

    def _initialize_from_empty(self): ...
    def _initialize_from_other(self, other: _Cls): ...
    def _get_partial_functions(self) -> dict[str, modal._partial_function._PartialFunction]: ...
    def _get_app(self) -> modal.app._App: ...
    def _get_user_cls(self) -> type: ...
    def _get_name(self) -> str: ...
    def _get_class_service_function(self) -> modal._functions._Function: ...
    def _get_method_names(self) -> collections.abc.Collection[str]: ...
    async def _experimental_get_flash_urls(self) -> typing.Optional[list[str]]:
        """URL of the flash service for the class."""
        ...

    def _hydrate_metadata(self, metadata: google.protobuf.message.Message): ...
    @staticmethod
    def validate_construction_mechanism(user_cls):
        """mdmd:hidden"""
        ...

    @staticmethod
    def from_local(user_cls, app: modal.app._App, class_service_function: modal._functions._Function) -> _Cls:
        """mdmd:hidden"""
        ...

    @classmethod
    def from_name(
        cls: type[_Cls],
        app_name: str,
        name: str,
        *,
        namespace: typing.Any = None,
        environment_name: typing.Optional[str] = None,
        client: typing.Optional[modal.client._Client] = None,
    ) -> _Cls:
        """Reference a Cls from a deployed App by its name.

        This is a lazy method that defers hydrating the local
        object with metadata from Modal servers until the first
        time it is actually used.

        ```python
        Model = modal.Cls.from_name("other-app", "Model")
        ```
        """
        ...

    def with_options(
        self: _Cls,
        *,
        cpu: typing.Union[float, tuple[float, float], None] = None,
        memory: typing.Union[int, tuple[int, int], None] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret._Secret]] = None,
        volumes: dict[
            typing.Union[str, pathlib.PurePosixPath],
            typing.Union[modal.volume._Volume, modal.cloud_bucket_mount._CloudBucketMount],
        ] = {},
        retries: typing.Union[int, modal.retries.Retries, None] = None,
        max_containers: typing.Optional[int] = None,
        buffer_containers: typing.Optional[int] = None,
        scaledown_window: typing.Optional[int] = None,
        timeout: typing.Optional[int] = None,
        region: typing.Union[str, typing.Sequence[str], None] = None,
        cloud: typing.Optional[str] = None,
        concurrency_limit: typing.Optional[int] = None,
        container_idle_timeout: typing.Optional[int] = None,
        allow_concurrent_inputs: typing.Optional[int] = None,
    ) -> _Cls:
        """Override the static Function configuration at runtime.

        This method will return a new instance of the cls that will autoscale independently of the
        original instance. Note that options cannot be "unset" with this method (i.e., if a GPU
        is configured in the `@app.cls()` decorator, passing `gpu=None` here will not create a
        CPU-only instance).

        **Usage:**

        You can use this method after looking up the Cls from a deployed App or if you have a
        direct reference to a Cls from another Function or local entrypoint on its App:

        ```python notest
        Model = modal.Cls.from_name("my_app", "Model")
        ModelUsingGPU = Model.with_options(gpu="A100")
        ModelUsingGPU().generate.remote(input_prompt)  # Run with an A100 GPU
        ```

        The method can be called multiple times to "stack" updates:

        ```python notest
        Model.with_options(gpu="A100").with_options(scaledown_window=300)  # Use an A100 with slow scaledown
        ```

        Note that container arguments (i.e. `volumes` and `secrets`) passed in subsequent calls
        will not be merged.
        """
        ...

    def with_concurrency(self: _Cls, *, max_inputs: int, target_inputs: typing.Optional[int] = None) -> _Cls:
        """Create an instance of the Cls with input concurrency enabled or overridden with new values.

        **Usage:**

        ```python notest
        Model = modal.Cls.from_name("my_app", "Model")
        ModelUsingGPU = Model.with_options(gpu="A100").with_concurrency(max_inputs=100)
        ModelUsingGPU().generate.remote(42)  # will run on an A100 GPU with input concurrency enabled
        ```
        """
        ...

    def with_batching(self: _Cls, *, max_batch_size: int, wait_ms: int) -> _Cls:
        """Create an instance of the Cls with dynamic batching enabled or overridden with new values.

        **Usage:**

        ```python notest
        Model = modal.Cls.from_name("my_app", "Model")
        ModelUsingGPU = Model.with_options(gpu="A100").with_batching(max_batch_size=100, batch_wait_ms=1000)
        ModelUsingGPU().generate.remote(42)  # will run on an A100 GPU with input concurrency enabled
        ```
        """
        ...

    def __call__(self, *args, **kwargs) -> _Obj:
        """This acts as the class constructor."""
        ...

    def __getattr__(self, k): ...
    def _is_local(self) -> bool: ...

class Cls(modal.object.Object):
    """Cls adds method pooling and [lifecycle hook](https://modal.com/docs/guide/lifecycle-functions) behavior
    to [modal.Function](https://modal.com/docs/reference/modal.Function).

    Generally, you will not construct a Cls directly.
    Instead, use the [`@app.cls()`](https://modal.com/docs/reference/modal.App#cls) decorator on the App object.
    """

    _class_service_function: typing.Optional[modal.functions.Function]
    _options: _ServiceOptions
    _app: typing.Optional[modal.app.App]
    _name: typing.Optional[str]
    _method_metadata: typing.Optional[dict[str, modal_proto.api_pb2.FunctionHandleMetadata]]
    _user_cls: typing.Optional[type]
    _method_partials: typing.Optional[dict[str, modal.partial_function.PartialFunction]]
    _callables: dict[str, collections.abc.Callable[..., typing.Any]]

    def __init__(self, *args, **kwargs):
        """mdmd:hidden"""
        ...

    def _initialize_from_empty(self): ...
    def _initialize_from_other(self, other: Cls): ...
    def _get_partial_functions(self) -> dict[str, modal.partial_function.PartialFunction]: ...
    def _get_app(self) -> modal.app.App: ...
    def _get_user_cls(self) -> type: ...
    def _get_name(self) -> str: ...
    def _get_class_service_function(self) -> modal.functions.Function: ...
    def _get_method_names(self) -> collections.abc.Collection[str]: ...

    class ___experimental_get_flash_urls_spec(typing_extensions.Protocol):
        def __call__(self, /) -> typing.Optional[list[str]]:
            """URL of the flash service for the class."""
            ...

        async def aio(self, /) -> typing.Optional[list[str]]:
            """URL of the flash service for the class."""
            ...

    _experimental_get_flash_urls: ___experimental_get_flash_urls_spec

    def _hydrate_metadata(self, metadata: google.protobuf.message.Message): ...
    @staticmethod
    def validate_construction_mechanism(user_cls):
        """mdmd:hidden"""
        ...

    @staticmethod
    def from_local(user_cls, app: modal.app.App, class_service_function: modal.functions.Function) -> Cls:
        """mdmd:hidden"""
        ...

    @classmethod
    def from_name(
        cls: type[Cls],
        app_name: str,
        name: str,
        *,
        namespace: typing.Any = None,
        environment_name: typing.Optional[str] = None,
        client: typing.Optional[modal.client.Client] = None,
    ) -> Cls:
        """Reference a Cls from a deployed App by its name.

        This is a lazy method that defers hydrating the local
        object with metadata from Modal servers until the first
        time it is actually used.

        ```python
        Model = modal.Cls.from_name("other-app", "Model")
        ```
        """
        ...

    def with_options(
        self: Cls,
        *,
        cpu: typing.Union[float, tuple[float, float], None] = None,
        memory: typing.Union[int, tuple[int, int], None] = None,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig] = None,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret.Secret]] = None,
        volumes: dict[
            typing.Union[str, pathlib.PurePosixPath],
            typing.Union[modal.volume.Volume, modal.cloud_bucket_mount.CloudBucketMount],
        ] = {},
        retries: typing.Union[int, modal.retries.Retries, None] = None,
        max_containers: typing.Optional[int] = None,
        buffer_containers: typing.Optional[int] = None,
        scaledown_window: typing.Optional[int] = None,
        timeout: typing.Optional[int] = None,
        region: typing.Union[str, typing.Sequence[str], None] = None,
        cloud: typing.Optional[str] = None,
        concurrency_limit: typing.Optional[int] = None,
        container_idle_timeout: typing.Optional[int] = None,
        allow_concurrent_inputs: typing.Optional[int] = None,
    ) -> Cls:
        """Override the static Function configuration at runtime.

        This method will return a new instance of the cls that will autoscale independently of the
        original instance. Note that options cannot be "unset" with this method (i.e., if a GPU
        is configured in the `@app.cls()` decorator, passing `gpu=None` here will not create a
        CPU-only instance).

        **Usage:**

        You can use this method after looking up the Cls from a deployed App or if you have a
        direct reference to a Cls from another Function or local entrypoint on its App:

        ```python notest
        Model = modal.Cls.from_name("my_app", "Model")
        ModelUsingGPU = Model.with_options(gpu="A100")
        ModelUsingGPU().generate.remote(input_prompt)  # Run with an A100 GPU
        ```

        The method can be called multiple times to "stack" updates:

        ```python notest
        Model.with_options(gpu="A100").with_options(scaledown_window=300)  # Use an A100 with slow scaledown
        ```

        Note that container arguments (i.e. `volumes` and `secrets`) passed in subsequent calls
        will not be merged.
        """
        ...

    def with_concurrency(self: Cls, *, max_inputs: int, target_inputs: typing.Optional[int] = None) -> Cls:
        """Create an instance of the Cls with input concurrency enabled or overridden with new values.

        **Usage:**

        ```python notest
        Model = modal.Cls.from_name("my_app", "Model")
        ModelUsingGPU = Model.with_options(gpu="A100").with_concurrency(max_inputs=100)
        ModelUsingGPU().generate.remote(42)  # will run on an A100 GPU with input concurrency enabled
        ```
        """
        ...

    def with_batching(self: Cls, *, max_batch_size: int, wait_ms: int) -> Cls:
        """Create an instance of the Cls with dynamic batching enabled or overridden with new values.

        **Usage:**

        ```python notest
        Model = modal.Cls.from_name("my_app", "Model")
        ModelUsingGPU = Model.with_options(gpu="A100").with_batching(max_batch_size=100, batch_wait_ms=1000)
        ModelUsingGPU().generate.remote(42)  # will run on an A100 GPU with input concurrency enabled
        ```
        """
        ...

    def __call__(self, *args, **kwargs) -> Obj:
        """This acts as the class constructor."""
        ...

    def __getattr__(self, k): ...
    def _is_local(self) -> bool: ...

class ___get_constructor_args_spec(typing_extensions.Protocol):
    def __call__(self, /, cls: Cls) -> typing.Sequence[modal_proto.api_pb2.ClassParameterSpec]: ...
    async def aio(self, /, cls: Cls) -> typing.Sequence[modal_proto.api_pb2.ClassParameterSpec]: ...

_get_constructor_args: ___get_constructor_args_spec

class ___get_method_schemas_spec(typing_extensions.Protocol):
    def __call__(self, /, cls: Cls) -> dict[str, modal_proto.api_pb2.FunctionSchema]: ...
    async def aio(self, /, cls: Cls) -> dict[str, modal_proto.api_pb2.FunctionSchema]: ...

_get_method_schemas: ___get_method_schemas_spec

class _NO_DEFAULT:
    def __repr__(self):
        """Return repr(self)."""
        ...

_no_default: _NO_DEFAULT

class _Parameter:
    default: typing.Any
    init: bool

    def __init__(self, default: typing.Any, init: bool):
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def __get__(self, obj, obj_type=None) -> typing.Any: ...

def is_parameter(p: typing.Any) -> bool: ...
def parameter(*, default: typing.Any = modal.cls._NO_DEFAULT(), init: bool = True) -> typing.Any:
    """Used to specify options for modal.cls parameters, similar to dataclass.field for dataclasses
    ```
    class A:
        a: str = modal.parameter()

    ```

    If `init=False` is specified, the field is not considered a parameter for the
    Modal class and not used in the synthesized constructor. This can be used to
    optionally annotate the type of a field that's used internally, for example values
    being set by @enter lifecycle methods, without breaking type checkers, but it has
    no runtime effect on the class.
    """
    ...
