import collections.abc
import google.protobuf.message
import modal._functions
import modal._load_context
import modal._utils.async_utils
import modal._utils.function_utils
import modal.app
import modal.call_graph
import modal.client
import modal.cloud_bucket_mount
import modal.cls
import modal.gpu
import modal.image
import modal.mount
import modal.network_file_system
import modal.object
import modal.parallel_map
import modal.proxy
import modal.retries
import modal.schedule
import modal.secret
import modal.volume
import modal_proto.api_pb2
import pathlib
import typing
import typing_extensions

ReturnType_INNER = typing.TypeVar("ReturnType_INNER", covariant=True)

P_INNER = typing_extensions.ParamSpec("P_INNER")

class Function(
    typing.Generic[modal._functions.P, modal._functions.ReturnType, modal._functions.OriginalReturnType],
    modal.object.Object,
):
    """Functions are the basic units of serverless execution on Modal.

    Generally, you will not construct a `Function` directly. Instead, use the
    `App.function()` decorator to register your Python functions with your App.
    """

    _info: typing.Optional[modal._utils.function_utils.FunctionInfo]
    _serve_mounts: frozenset[modal.mount.Mount]
    _app: typing.Optional[modal.app.App]
    _obj: typing.Optional[modal.cls.Obj]
    _webhook_config: typing.Optional[modal_proto.api_pb2.WebhookConfig]
    _web_url: typing.Optional[str]
    _function_name: typing.Optional[str]
    _is_method: bool
    _spec: typing.Optional[modal._functions._FunctionSpec]
    _tag: str
    _raw_f: typing.Optional[collections.abc.Callable[..., typing.Any]]
    _build_args: dict
    _is_generator: typing.Optional[bool]
    _use_method_name: str
    _class_parameter_info: typing.Optional[modal_proto.api_pb2.ClassParameterInfo]
    _method_handle_metadata: typing.Optional[dict[str, modal_proto.api_pb2.FunctionHandleMetadata]]
    _metadata: typing.Optional[modal_proto.api_pb2.FunctionHandleMetadata]

    def __init__(self, *args, **kwargs):
        """mdmd:hidden"""
        ...

    @staticmethod
    def from_local(
        info: modal._utils.function_utils.FunctionInfo,
        app: typing.Optional[modal.app.App],
        image: modal.image.Image,
        env: typing.Optional[dict[str, typing.Optional[str]]] = None,
        secrets: typing.Optional[collections.abc.Collection[modal.secret.Secret]] = None,
        schedule: typing.Optional[modal.schedule.Schedule] = None,
        is_generator: bool = False,
        gpu: typing.Union[None, str, modal.gpu._GPUConfig, list[typing.Union[None, str, modal.gpu._GPUConfig]]] = None,
        network_file_systems: dict[
            typing.Union[str, pathlib.PurePosixPath], modal.network_file_system.NetworkFileSystem
        ] = {},
        volumes: dict[
            typing.Union[str, pathlib.PurePosixPath],
            typing.Union[modal.volume.Volume, modal.cloud_bucket_mount.CloudBucketMount],
        ] = {},
        webhook_config: typing.Optional[modal_proto.api_pb2.WebhookConfig] = None,
        cpu: typing.Union[float, tuple[float, float], None] = None,
        memory: typing.Union[int, tuple[int, int], None] = None,
        proxy: typing.Optional[modal.proxy.Proxy] = None,
        retries: typing.Union[int, modal.retries.Retries, None] = None,
        timeout: int = 300,
        startup_timeout: typing.Optional[int] = None,
        min_containers: typing.Optional[int] = None,
        max_containers: typing.Optional[int] = None,
        buffer_containers: typing.Optional[int] = None,
        scaledown_window: typing.Optional[int] = None,
        max_concurrent_inputs: typing.Optional[int] = None,
        target_concurrent_inputs: typing.Optional[int] = None,
        batch_max_size: typing.Optional[int] = None,
        batch_wait_ms: typing.Optional[int] = None,
        cloud: typing.Optional[str] = None,
        region: typing.Union[str, collections.abc.Sequence[str], None] = None,
        nonpreemptible: bool = False,
        is_builder_function: bool = False,
        is_auto_snapshot: bool = False,
        is_server: bool = False,
        enable_memory_snapshot: bool = False,
        block_network: bool = False,
        restrict_modal_access: bool = False,
        i6pn_enabled: bool = False,
        cluster_size: typing.Optional[int] = None,
        rdma: typing.Optional[bool] = None,
        single_use_containers: bool = False,
        ephemeral_disk: typing.Optional[int] = None,
        include_source: bool = True,
        experimental_options: typing.Optional[dict[str, str]] = None,
        _experimental_proxy_ip: typing.Optional[str] = None,
        _experimental_custom_scaling_factor: typing.Optional[float] = None,
        restrict_output: bool = False,
        http_config: typing.Optional[modal_proto.api_pb2.HTTPConfig] = None,
    ) -> Function:
        """mdmd:hidden

        Note: This is not intended to be public API.
        """
        ...

    def _bind_parameters(
        self,
        obj: modal.cls.Obj,
        options: typing.Optional[modal.cls._ServiceOptions],
        args: collections.abc.Sized,
        kwargs: dict[str, typing.Any],
    ) -> Function:
        """mdmd:hidden

        Binds a class-function to a specific instance of (init params, options) or a new workspace
        """
        ...

    class __update_autoscaler_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            *,
            min_containers: typing.Optional[int] = None,
            max_containers: typing.Optional[int] = None,
            buffer_containers: typing.Optional[int] = None,
            scaledown_window: typing.Optional[int] = None,
        ) -> None:
            """Override the current autoscaler behavior for this Function.

            Unspecified parameters will retain their current value, i.e. either the static value
            from the function decorator, or an override value from a previous call to this method.

            Subsequent deployments of the App containing this Function will reset the autoscaler back to
            its static configuration.

            Examples:

            ```python notest
            f = modal.Function.from_name("my-app", "function")

            # Always have at least 2 containers running, with an extra buffer when the Function is active
            f.update_autoscaler(min_containers=2, buffer_containers=1)

            # Limit this Function to avoid spinning up more than 5 containers
            f.update_autoscaler(max_containers=5)

            # Extend the scaledown window to increase the amount of time that idle containers stay alive
            f.update_autoscaler(scaledown_window=300)

            ```
            """
            ...

        async def aio(
            self,
            /,
            *,
            min_containers: typing.Optional[int] = None,
            max_containers: typing.Optional[int] = None,
            buffer_containers: typing.Optional[int] = None,
            scaledown_window: typing.Optional[int] = None,
        ) -> None:
            """Override the current autoscaler behavior for this Function.

            Unspecified parameters will retain their current value, i.e. either the static value
            from the function decorator, or an override value from a previous call to this method.

            Subsequent deployments of the App containing this Function will reset the autoscaler back to
            its static configuration.

            Examples:

            ```python notest
            f = modal.Function.from_name("my-app", "function")

            # Always have at least 2 containers running, with an extra buffer when the Function is active
            f.update_autoscaler(min_containers=2, buffer_containers=1)

            # Limit this Function to avoid spinning up more than 5 containers
            f.update_autoscaler(max_containers=5)

            # Extend the scaledown window to increase the amount of time that idle containers stay alive
            f.update_autoscaler(scaledown_window=300)

            ```
            """
            ...

    update_autoscaler: __update_autoscaler_spec

    class __keep_warm_spec(typing_extensions.Protocol):
        def __call__(self, /, warm_pool_size: int) -> None:
            """mdmd:hidden
            Set the warm pool size for the Function.

            DEPRECATED: Please adapt your code to use the more general `update_autoscaler` method instead:

            ```python notest
            f = modal.Function.from_name("my-app", "function")

            # Old pattern (deprecated)
            f.keep_warm(2)

            # New pattern
            f.update_autoscaler(min_containers=2)
            ```
            """
            ...

        async def aio(self, /, warm_pool_size: int) -> None:
            """mdmd:hidden
            Set the warm pool size for the Function.

            DEPRECATED: Please adapt your code to use the more general `update_autoscaler` method instead:

            ```python notest
            f = modal.Function.from_name("my-app", "function")

            # Old pattern (deprecated)
            f.keep_warm(2)

            # New pattern
            f.update_autoscaler(min_containers=2)
            ```
            """
            ...

    keep_warm: __keep_warm_spec

    @classmethod
    def _from_name(cls, app_name: str, name: str, *, load_context_overrides: modal._load_context.LoadContext): ...
    @classmethod
    def from_name(
        cls: type[Function],
        app_name: str,
        name: str,
        *,
        namespace=None,
        environment_name: typing.Optional[str] = None,
        client: typing.Optional[modal.client.Client] = None,
    ) -> Function:
        """Reference a Function from a deployed App by its name.

        This is a lazy method that defers hydrating the local
        object with metadata from Modal servers until the first
        time it is actually used.

        ```python
        f = modal.Function.from_name("other-app", "function")
        ```
        """
        ...

    @property
    def tag(self) -> str:
        """mdmd:hidden"""
        ...

    @property
    def app(self) -> modal.app.App:
        """mdmd:hidden"""
        ...

    @property
    def stub(self) -> modal.app.App:
        """mdmd:hidden"""
        ...

    @property
    def info(self) -> modal._utils.function_utils.FunctionInfo:
        """mdmd:hidden"""
        ...

    @property
    def spec(self) -> modal._functions._FunctionSpec:
        """mdmd:hidden"""
        ...

    def _is_web_endpoint(self) -> bool: ...
    def get_build_def(self) -> str:
        """mdmd:hidden"""
        ...

    def _initialize_from_empty(self): ...
    def _hydrate_metadata(self, metadata: typing.Optional[google.protobuf.message.Message]): ...
    def _get_metadata(self): ...
    def _check_no_web_url(self, fn_name: str): ...
    @property
    def web_url(self) -> typing.Optional[str]:
        """mdmd:hidden
        Deprecated. Use the `Function.get_web_url()` method instead.

        URL of a Function running as a web endpoint.
        """
        ...

    class __get_web_url_spec(typing_extensions.Protocol):
        def __call__(self, /) -> typing.Optional[str]:
            """URL of a Function running as a web endpoint."""
            ...

        async def aio(self, /) -> typing.Optional[str]:
            """URL of a Function running as a web endpoint."""
            ...

    get_web_url: __get_web_url_spec

    class ___experimental_get_flash_urls_spec(typing_extensions.Protocol):
        def __call__(self, /) -> typing.Optional[list[str]]:
            """URL of the flash service for the function."""
            ...

        async def aio(self, /) -> typing.Optional[list[str]]:
            """URL of the flash service for the function."""
            ...

    _experimental_get_flash_urls: ___experimental_get_flash_urls_spec

    @property
    def is_generator(self) -> bool:
        """mdmd:hidden"""
        ...

    class ___map_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            input_queue: modal.parallel_map.SynchronizedQueue,
            order_outputs: bool,
            return_exceptions: bool,
            wrap_returned_exceptions: bool,
        ) -> typing.Generator[typing.Any, None, None]:
            """mdmd:hidden

            Synchronicity-wrapped map implementation. To be safe against invocations of user code in
            the synchronicity thread it doesn't accept an [async]iterator, and instead takes a
              _SynchronizedQueue instance that is fed by higher level functions like .map()

            _SynchronizedQueue is used instead of asyncio.Queue so that the main thread can put
            items in the queue safely.
            """
            ...

        def aio(
            self,
            /,
            input_queue: modal.parallel_map.SynchronizedQueue,
            order_outputs: bool,
            return_exceptions: bool,
            wrap_returned_exceptions: bool,
        ) -> collections.abc.AsyncGenerator[typing.Any, None]:
            """mdmd:hidden

            Synchronicity-wrapped map implementation. To be safe against invocations of user code in
            the synchronicity thread it doesn't accept an [async]iterator, and instead takes a
              _SynchronizedQueue instance that is fed by higher level functions like .map()

            _SynchronizedQueue is used instead of asyncio.Queue so that the main thread can put
            items in the queue safely.
            """
            ...

    _map: ___map_spec

    class ___spawn_map_spec(typing_extensions.Protocol[ReturnType_INNER]):
        def __call__(self, /, input_queue: modal.parallel_map.SynchronizedQueue) -> FunctionCall[ReturnType_INNER]: ...
        async def aio(self, /, input_queue: modal.parallel_map.SynchronizedQueue) -> FunctionCall[ReturnType_INNER]: ...

    _spawn_map: ___spawn_map_spec[modal._functions.ReturnType]

    class ___call_function_spec(typing_extensions.Protocol[ReturnType_INNER]):
        def __call__(self, /, args, kwargs) -> ReturnType_INNER: ...
        async def aio(self, /, args, kwargs) -> ReturnType_INNER: ...

    _call_function: ___call_function_spec[modal._functions.ReturnType]

    class ___call_function_nowait_spec(typing_extensions.Protocol):
        def __call__(
            self, /, args, kwargs, function_call_invocation_type: int, from_spawn_map: bool = False
        ) -> modal._functions._Invocation: ...
        async def aio(
            self, /, args, kwargs, function_call_invocation_type: int, from_spawn_map: bool = False
        ) -> modal._functions._Invocation: ...

    _call_function_nowait: ___call_function_nowait_spec

    class ___call_generator_spec(typing_extensions.Protocol):
        def __call__(self, /, args, kwargs): ...
        def aio(self, /, args, kwargs): ...

    _call_generator: ___call_generator_spec

    class __remote_spec(typing_extensions.Protocol[P_INNER, ReturnType_INNER]):
        def __call__(self, /, *args: P_INNER.args, **kwargs: P_INNER.kwargs) -> ReturnType_INNER:
            """Calls the function remotely, executing it with the given arguments and returning the execution's result."""
            ...

        async def aio(self, /, *args: P_INNER.args, **kwargs: P_INNER.kwargs) -> ReturnType_INNER:
            """Calls the function remotely, executing it with the given arguments and returning the execution's result."""
            ...

    remote: __remote_spec[modal._functions.P, modal._functions.ReturnType]

    class __remote_gen_spec(typing_extensions.Protocol):
        def __call__(self, /, *args, **kwargs) -> typing.Generator[typing.Any, None, None]:
            """Calls the generator remotely, executing it with the given arguments and returning the execution's result."""
            ...

        def aio(self, /, *args, **kwargs) -> collections.abc.AsyncGenerator[typing.Any, None]:
            """Calls the generator remotely, executing it with the given arguments and returning the execution's result."""
            ...

    remote_gen: __remote_gen_spec

    def _is_local(self): ...
    def _get_info(self) -> modal._utils.function_utils.FunctionInfo: ...
    def _get_obj(self) -> typing.Optional[modal.cls.Obj]: ...
    def local(
        self, *args: modal._functions.P.args, **kwargs: modal._functions.P.kwargs
    ) -> modal._functions.OriginalReturnType:
        """Calls the function locally, executing it with the given arguments and returning the execution's result.

        The function will execute in the same environment as the caller, just like calling the underlying function
        directly in Python. In particular, only secrets available in the caller environment will be available
        through environment variables.
        """
        ...

    class ___experimental_spawn_spec(typing_extensions.Protocol[P_INNER, ReturnType_INNER]):
        def __call__(self, /, *args: P_INNER.args, **kwargs: P_INNER.kwargs) -> FunctionCall[ReturnType_INNER]:
            """[Experimental] Calls the function with the given arguments, without waiting for the results.

            This experimental version of the spawn method allows up to 1 million inputs to be spawned.

            Returns a `modal.FunctionCall` object, that can later be polled or
            waited for using `.get(timeout=...)`.
            Conceptually similar to `multiprocessing.pool.apply_async`, or a Future/Promise in other contexts.
            """
            ...

        async def aio(self, /, *args: P_INNER.args, **kwargs: P_INNER.kwargs) -> FunctionCall[ReturnType_INNER]:
            """[Experimental] Calls the function with the given arguments, without waiting for the results.

            This experimental version of the spawn method allows up to 1 million inputs to be spawned.

            Returns a `modal.FunctionCall` object, that can later be polled or
            waited for using `.get(timeout=...)`.
            Conceptually similar to `multiprocessing.pool.apply_async`, or a Future/Promise in other contexts.
            """
            ...

    _experimental_spawn: ___experimental_spawn_spec[modal._functions.P, modal._functions.ReturnType]

    class ___spawn_map_inner_spec(typing_extensions.Protocol[P_INNER]):
        def __call__(self, /, *args: P_INNER.args, **kwargs: P_INNER.kwargs) -> None: ...
        async def aio(self, /, *args: P_INNER.args, **kwargs: P_INNER.kwargs) -> None: ...

    _spawn_map_inner: ___spawn_map_inner_spec[modal._functions.P]

    class __spawn_spec(typing_extensions.Protocol[P_INNER, ReturnType_INNER]):
        def __call__(self, /, *args: P_INNER.args, **kwargs: P_INNER.kwargs) -> FunctionCall[ReturnType_INNER]:
            """Calls the function with the given arguments, without waiting for the results.

            Returns a [`modal.FunctionCall`](https://modal.com/docs/reference/modal.FunctionCall) object
            that can later be polled or waited for using
            [`.get(timeout=...)`](https://modal.com/docs/reference/modal.FunctionCall#get).
            Conceptually similar to `multiprocessing.pool.apply_async`, or a Future/Promise in other contexts.
            """
            ...

        async def aio(self, /, *args: P_INNER.args, **kwargs: P_INNER.kwargs) -> FunctionCall[ReturnType_INNER]:
            """Calls the function with the given arguments, without waiting for the results.

            Returns a [`modal.FunctionCall`](https://modal.com/docs/reference/modal.FunctionCall) object
            that can later be polled or waited for using
            [`.get(timeout=...)`](https://modal.com/docs/reference/modal.FunctionCall#get).
            Conceptually similar to `multiprocessing.pool.apply_async`, or a Future/Promise in other contexts.
            """
            ...

    spawn: __spawn_spec[modal._functions.P, modal._functions.ReturnType]

    def get_raw_f(self) -> collections.abc.Callable[..., typing.Any]:
        """Return the inner Python object wrapped by this Modal Function."""
        ...

    class __get_current_stats_spec(typing_extensions.Protocol):
        def __call__(self, /) -> modal._functions.FunctionStats:
            """Return a `FunctionStats` object describing the current function's queue and runner counts."""
            ...

        async def aio(self, /) -> modal._functions.FunctionStats:
            """Return a `FunctionStats` object describing the current function's queue and runner counts."""
            ...

    get_current_stats: __get_current_stats_spec

    class ___get_schema_spec(typing_extensions.Protocol):
        def __call__(self, /) -> modal_proto.api_pb2.FunctionSchema:
            """Returns recorded schema for function, internal use only for now"""
            ...

        async def aio(self, /) -> modal_proto.api_pb2.FunctionSchema:
            """Returns recorded schema for function, internal use only for now"""
            ...

    _get_schema: ___get_schema_spec

    class __map_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            *input_iterators,
            kwargs={},
            order_outputs: bool = True,
            return_exceptions: bool = False,
            wrap_returned_exceptions: bool = True,
        ) -> modal._utils.async_utils.AsyncOrSyncIterable:
            """Parallel map over a set of inputs.

            Takes one iterator argument per argument in the function being mapped over.

            Example:
            ```python
            @app.function()
            def my_func(a):
                return a ** 2


            @app.local_entrypoint()
            def main():
                assert list(my_func.map([1, 2, 3, 4])) == [1, 4, 9, 16]
            ```

            If applied to a `app.function`, `map()` returns one result per input and the output order
            is guaranteed to be the same as the input order. Set `order_outputs=False` to return results
            in the order that they are completed instead.

            `return_exceptions` can be used to treat exceptions as successful results:

            ```python
            @app.function()
            def my_func(a):
                if a == 2:
                    raise Exception("ohno")
                return a ** 2


            @app.local_entrypoint()
            def main():
                # [0, 1, UserCodeException(Exception('ohno'))]
                print(list(my_func.map(range(3), return_exceptions=True)))
            ```
            """
            ...

        def aio(
            self,
            /,
            *input_iterators: typing.Union[typing.Iterable[typing.Any], typing.AsyncIterable[typing.Any]],
            kwargs={},
            order_outputs: bool = True,
            return_exceptions: bool = False,
            wrap_returned_exceptions: bool = True,
        ) -> typing.AsyncGenerator[typing.Any, None]: ...

    map: __map_spec

    class __starmap_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            input_iterator: typing.Iterable[typing.Sequence[typing.Any]],
            *,
            kwargs={},
            order_outputs: bool = True,
            return_exceptions: bool = False,
            wrap_returned_exceptions: bool = True,
        ) -> modal._utils.async_utils.AsyncOrSyncIterable:
            """Like `map`, but spreads arguments over multiple function arguments.

            Assumes every input is a sequence (e.g. a tuple).

            Example:
            ```python
            @app.function()
            def my_func(a, b):
                return a + b


            @app.local_entrypoint()
            def main():
                assert list(my_func.starmap([(1, 2), (3, 4)])) == [3, 7]
            ```
            """
            ...

        def aio(
            self,
            /,
            input_iterator: typing.Union[
                typing.Iterable[typing.Sequence[typing.Any]], typing.AsyncIterable[typing.Sequence[typing.Any]]
            ],
            *,
            kwargs={},
            order_outputs: bool = True,
            return_exceptions: bool = False,
            wrap_returned_exceptions: bool = True,
        ) -> typing.AsyncIterable[typing.Any]: ...

    starmap: __starmap_spec

    class __for_each_spec(typing_extensions.Protocol):
        def __call__(self, /, *input_iterators, kwargs={}, ignore_exceptions: bool = False):
            """Execute function for all inputs, ignoring outputs. Waits for completion of the inputs.

            Convenient alias for `.map()` in cases where the function just needs to be called.
            as the caller doesn't have to consume the generator to process the inputs.
            """
            ...

        async def aio(self, /, *input_iterators, kwargs={}, ignore_exceptions: bool = False) -> None: ...

    for_each: __for_each_spec

    class __spawn_map_spec(typing_extensions.Protocol):
        def __call__(self, /, *input_iterators, kwargs={}) -> None:
            """Spawn parallel execution over a set of inputs, exiting as soon as the inputs are created (without waiting
            for the map to complete).

            Takes one iterator argument per argument in the function being mapped over.

            Example:
            ```python
            @app.function()
            def my_func(a):
                return a ** 2


            @app.local_entrypoint()
            def main():
                my_func.spawn_map([1, 2, 3, 4])
            ```

            Programmatic retrieval of results will be supported in a future update.
            """
            ...

        async def aio(self, /, *input_iterators, kwargs={}) -> None:
            """This runs in an event loop on the main thread. It consumes inputs from the input iterators and creates async
            function calls for each.
            """
            ...

    spawn_map: __spawn_map_spec

    class __experimental_spawn_map_spec(typing_extensions.Protocol):
        def __call__(self, /, *input_iterators, kwargs={}) -> modal._functions._FunctionCall:
            """mdmd:hidden
            Spawn parallel execution over a set of inputs, returning as soon as the inputs are created.

            Unlike `modal.Function.map`, this method does not block on completion of the remote execution but
            returns a `modal.FunctionCall` object that can be used to poll status and retrieve results later.

            Takes one iterator argument per argument in the function being mapped over.

            Example:
            ```python
            @app.function()
            def my_func(a, b):
                return a ** b


            @app.local_entrypoint()
            def main():
                fc = my_func.spawn_map([1, 2], [3, 4])
            ```
            """
            ...

        async def aio(self, /, *input_iterators, kwargs={}) -> modal._functions._FunctionCall: ...

    experimental_spawn_map: __experimental_spawn_map_spec

class FunctionCall(typing.Generic[modal._functions.ReturnType], modal.object.Object):
    """A reference to an executed function call.

    Constructed using `.spawn(...)` on a Modal function with the same
    arguments that a function normally takes. Acts as a reference to
    an ongoing function call that can be passed around and used to
    poll or fetch function results at some later time.

    Conceptually similar to a Future/Promise/AsyncResult in other contexts and languages.
    """

    _is_generator: bool
    _num_inputs: typing.Optional[int]

    def __init__(self, *args, **kwargs):
        """mdmd:hidden"""
        ...

    def _invocation(self): ...

    class __num_inputs_spec(typing_extensions.Protocol):
        def __call__(self, /) -> int:
            """Get the number of inputs in the function call."""
            ...

        async def aio(self, /) -> int:
            """Get the number of inputs in the function call."""
            ...

    num_inputs: __num_inputs_spec

    class __get_spec(typing_extensions.Protocol[ReturnType_INNER]):
        def __call__(self, /, timeout: typing.Optional[float] = None, *, index: int = 0) -> ReturnType_INNER:
            """Get the result of the index-th input of the function call.
            `.spawn()` calls have a single output, so only specifying `index=0` is valid.
            A non-zero index is useful when your function has multiple outputs, like via `.spawn_map()`.

            This function waits indefinitely by default. It takes an optional
            `timeout` argument that specifies the maximum number of seconds to wait,
            which can be set to `0` to poll for an output immediately.

            The returned coroutine is not cancellation-safe.
            """
            ...

        async def aio(self, /, timeout: typing.Optional[float] = None, *, index: int = 0) -> ReturnType_INNER:
            """Get the result of the index-th input of the function call.
            `.spawn()` calls have a single output, so only specifying `index=0` is valid.
            A non-zero index is useful when your function has multiple outputs, like via `.spawn_map()`.

            This function waits indefinitely by default. It takes an optional
            `timeout` argument that specifies the maximum number of seconds to wait,
            which can be set to `0` to poll for an output immediately.

            The returned coroutine is not cancellation-safe.
            """
            ...

    get: __get_spec[modal._functions.ReturnType]

    class __iter_spec(typing_extensions.Protocol[ReturnType_INNER]):
        def __call__(self, /, *, start: int = 0, end: typing.Optional[int] = None) -> typing.Iterator[ReturnType_INNER]:
            """Iterate in-order over the results of the function call.

            Optionally, specify a range [start, end) to iterate over.

            Example:
            ```python
            @app.function()
            def my_func(a):
                return a ** 2


            @app.local_entrypoint()
            def main():
                fc = my_func.spawn_map([1, 2, 3, 4])
                assert list(fc.iter()) == [1, 4, 9, 16]
                assert list(fc.iter(start=1, end=3)) == [4, 9]
            ```

            If `end` is not provided, it will iterate over all results.
            """
            ...

        def aio(self, /, *, start: int = 0, end: typing.Optional[int] = None) -> typing.AsyncIterator[ReturnType_INNER]:
            """Iterate in-order over the results of the function call.

            Optionally, specify a range [start, end) to iterate over.

            Example:
            ```python
            @app.function()
            def my_func(a):
                return a ** 2


            @app.local_entrypoint()
            def main():
                fc = my_func.spawn_map([1, 2, 3, 4])
                assert list(fc.iter()) == [1, 4, 9, 16]
                assert list(fc.iter(start=1, end=3)) == [4, 9]
            ```

            If `end` is not provided, it will iterate over all results.
            """
            ...

    iter: __iter_spec[modal._functions.ReturnType]

    class __get_call_graph_spec(typing_extensions.Protocol):
        def __call__(self, /) -> list[modal.call_graph.InputInfo]:
            """Returns a structure representing the call graph from a given root
            call ID, along with the status of execution for each node.

            See [`modal.call_graph`](https://modal.com/docs/reference/modal.call_graph) reference page
            for documentation on the structure of the returned `InputInfo` items.
            """
            ...

        async def aio(self, /) -> list[modal.call_graph.InputInfo]:
            """Returns a structure representing the call graph from a given root
            call ID, along with the status of execution for each node.

            See [`modal.call_graph`](https://modal.com/docs/reference/modal.call_graph) reference page
            for documentation on the structure of the returned `InputInfo` items.
            """
            ...

    get_call_graph: __get_call_graph_spec

    class __cancel_spec(typing_extensions.Protocol):
        def __call__(self, /, terminate_containers: bool = False):
            """Cancels the function call, which will stop its execution and mark its inputs as
            [`TERMINATED`](https://modal.com/docs/reference/modal.call_graph#modalcall_graphinputstatus).

            If `terminate_containers=True` - the containers running the cancelled inputs are all terminated
            causing any non-cancelled inputs on those containers to be rescheduled in new containers.
            """
            ...

        async def aio(self, /, terminate_containers: bool = False):
            """Cancels the function call, which will stop its execution and mark its inputs as
            [`TERMINATED`](https://modal.com/docs/reference/modal.call_graph#modalcall_graphinputstatus).

            If `terminate_containers=True` - the containers running the cancelled inputs are all terminated
            causing any non-cancelled inputs on those containers to be rescheduled in new containers.
            """
            ...

    cancel: __cancel_spec

    class __from_id_spec(typing_extensions.Protocol):
        def __call__(
            self, /, function_call_id: str, client: typing.Optional[modal.client.Client] = None
        ) -> FunctionCall[typing.Any]:
            """Instantiate a FunctionCall object from an existing ID.

            Examples:

            ```python notest
            # Spawn a FunctionCall and keep track of its object ID
            fc = my_func.spawn()
            fc_id = fc.object_id

            # Later, use the ID to re-instantiate the FunctionCall object
            fc = FunctionCall.from_id(fc_id)
            result = fc.get()
            ```

            Note that it's only necessary to re-instantiate the `FunctionCall` with this method
            if you no longer have access to the original object returned from `Function.spawn`.
            """
            ...

        async def aio(self, /, function_call_id: str, client: typing.Optional[modal.client.Client] = None): ...

    from_id: typing.ClassVar[__from_id_spec]

    class __gather_spec(typing_extensions.Protocol):
        def __call__(self, /, *function_calls: FunctionCall[modal._functions.T]) -> typing.Sequence[modal._functions.T]:
            """Wait until all Modal FunctionCall objects have results before returning.

            Accepts a variable number of `FunctionCall` objects, as returned by `Function.spawn()`.

            Returns a list of results from each FunctionCall, or raises an exception
            from the first failing function call.

            Examples:

            ```python notest
            fc1 = slow_func_1.spawn()
            fc2 = slow_func_2.spawn()

            result_1, result_2 = modal.FunctionCall.gather(fc1, fc2)
            ```

            *Added in v0.73.69*: This method replaces the deprecated `modal.functions.gather` function.
            """
            ...

        async def aio(
            self, /, *function_calls: FunctionCall[modal._functions.T]
        ) -> typing.Sequence[modal._functions.T]:
            """Wait until all Modal FunctionCall objects have results before returning.

            Accepts a variable number of `FunctionCall` objects, as returned by `Function.spawn()`.

            Returns a list of results from each FunctionCall, or raises an exception
            from the first failing function call.

            Examples:

            ```python notest
            fc1 = slow_func_1.spawn()
            fc2 = slow_func_2.spawn()

            result_1, result_2 = modal.FunctionCall.gather(fc1, fc2)
            ```

            *Added in v0.73.69*: This method replaces the deprecated `modal.functions.gather` function.
            """
            ...

    gather: typing.ClassVar[__gather_spec]

class __gather_spec(typing_extensions.Protocol):
    def __call__(self, /, *function_calls) -> typing.Sequence[modal._functions.T]:
        """mdmd:hidden
        Deprecated: Please use `modal.FunctionCall.gather()` instead.
        """
        ...

    async def aio(self, /, *function_calls) -> typing.Sequence[modal._functions.T]:
        """mdmd:hidden
        Deprecated: Please use `modal.FunctionCall.gather()` instead.
        """
        ...

gather: __gather_spec
