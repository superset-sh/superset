import asyncio
import asyncio.locks
import asyncio.queues
import collections.abc
import modal._runtime.user_code_imports
import modal.client
import modal_proto.api_pb2
import synchronicity.combined_types
import typing
import typing_extensions

class UserException(Exception):
    """Used to shut down the task gracefully."""

    ...

class Sentinel:
    """Used to get type-stubs to work with this object."""

    ...

class IOContext:
    """Context object for managing input, function calls, and function executions
    in a batched or single input context.
    """

    input_ids: list[str]
    retry_counts: list[int]
    function_call_ids: list[str]
    attempt_tokens: list[str]
    function_inputs: list[modal_proto.api_pb2.FunctionInput]
    finalized_function: modal._runtime.user_code_imports.FinalizedFunction
    _cancel_issued: bool
    _cancel_callback: typing.Optional[collections.abc.Callable[[], None]]

    def __init__(
        self,
        input_ids: list[str],
        retry_counts: list[int],
        function_call_ids: list[str],
        attempt_tokens: list[str],
        finalized_function: modal._runtime.user_code_imports.FinalizedFunction,
        function_inputs: list[modal_proto.api_pb2.FunctionInput],
        is_batched: bool,
        client: modal.client._Client,
    ):
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    @classmethod
    async def create(
        cls,
        client: modal.client._Client,
        finalized_functions: dict[str, modal._runtime.user_code_imports.FinalizedFunction],
        inputs: list[tuple[str, int, str, str, modal_proto.api_pb2.FunctionInput]],
        is_batched: bool,
    ) -> IOContext: ...
    def set_cancel_callback(self, cb: collections.abc.Callable[[], None]): ...
    def cancel(self): ...
    def _args_and_kwargs(self) -> tuple[tuple[typing.Any, ...], dict[str, list[typing.Any]]]: ...
    def _generator_output_format(self) -> int: ...
    def _prepare_batch_output(self, data: typing.Any) -> list[typing.Any]: ...
    def call_function_sync(self) -> list[typing.Any]: ...
    async def call_function_async(self) -> list[typing.Any]: ...
    def call_generator_sync(self) -> typing.Generator[typing.Any, None, None]: ...
    def call_generator_async(self) -> collections.abc.AsyncGenerator[typing.Any, None]: ...
    async def output_items_cancellation(self, started_at: float): ...
    def _determine_output_format(self, input_format: int) -> int: ...
    async def output_items_exception(
        self, started_at: float, task_id: str, exc: BaseException
    ) -> list[modal_proto.api_pb2.FunctionPutOutputsItem]: ...
    def output_items_generator_done(
        self, started_at: float, items_total: int
    ) -> list[modal_proto.api_pb2.FunctionPutOutputsItem]: ...
    async def output_items(
        self, started_at: float, data: list[typing.Any]
    ) -> list[modal_proto.api_pb2.FunctionPutOutputsItem]: ...

class InputSlots:
    """A semaphore that allows dynamically adjusting the concurrency."""

    active: int
    value: int
    waiter: typing.Optional[asyncio.Future]
    closed: bool

    def __init__(self, value: int) -> None:
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    async def acquire(self) -> None: ...
    def _wake_waiter(self) -> None: ...
    def release(self) -> None: ...
    def set_value(self, value: int) -> None: ...
    async def close(self) -> None: ...

class _ContainerIOManager:
    """Synchronizes all RPC calls and network operations for a running container.

    TODO: maybe we shouldn't synchronize the whole class.
    Then we could potentially move a bunch of the global functions onto it.
    """

    task_id: str
    function_id: str
    app_id: str
    function_def: modal_proto.api_pb2.Function
    checkpoint_id: typing.Optional[str]
    input_plane_server_url: typing.Optional[str]
    calls_completed: int
    total_user_time: float
    current_input_id: typing.Optional[str]
    current_inputs: dict[str, IOContext]
    current_input_started_at: typing.Optional[float]
    _input_concurrency_enabled: bool
    _target_concurrency: int
    _max_concurrency: int
    _concurrency_loop: typing.Optional[asyncio.Task]
    _input_slots: InputSlots
    _environment_name: str
    _heartbeat_loop: typing.Optional[asyncio.Task]
    _heartbeat_condition: typing.Optional[asyncio.locks.Condition]
    _waiting_for_memory_snapshot: bool
    _is_interactivity_enabled: bool
    _fetching_inputs: bool
    _client: modal.client._Client
    _singleton: typing.ClassVar[typing.Optional[_ContainerIOManager]]

    def _init(self, container_args: modal_proto.api_pb2.ContainerArguments, client: modal.client._Client): ...
    @property
    def heartbeat_condition(self) -> asyncio.locks.Condition: ...
    @staticmethod
    def __new__(
        cls, container_args: modal_proto.api_pb2.ContainerArguments, client: modal.client._Client
    ) -> _ContainerIOManager:
        """Create and return a new object.  See help(type) for accurate signature."""
        ...

    @classmethod
    def _reset_singleton(cls):
        """Only used for tests."""
        ...

    async def hello(self): ...
    async def _run_heartbeat_loop(self): ...
    async def _heartbeat_handle_cancellations(self) -> bool: ...
    def heartbeats(self, wait_for_mem_snap: bool) -> typing.AsyncContextManager[None]: ...
    def stop_heartbeat(self): ...
    def dynamic_concurrency_manager(self) -> typing.AsyncContextManager[None]: ...
    async def _dynamic_concurrency_loop(self): ...
    def get_data_in(
        self, function_call_id: str, attempt_token: typing.Optional[str]
    ) -> collections.abc.AsyncIterator[typing.Any]:
        """Read from the `data_in` stream of a function call."""
        ...

    async def put_data_out(
        self,
        function_call_id: str,
        attempt_token: str,
        start_index: int,
        data_format: int,
        serialized_messages: list[typing.Any],
    ) -> None:
        """Put data onto the `data_out` stream of a function call.

        This is used for generator outputs, which includes web endpoint responses. Note that this
        was introduced as a performance optimization in client version 0.57, so older clients will
        still use the previous Postgres-backed system based on `FunctionPutOutputs()`.
        """
        ...

    def generator_output_sender(
        self, function_call_id: str, attempt_token: str, data_format: int, message_rx: asyncio.queues.Queue
    ) -> typing.AsyncContextManager[None]:
        """Runs background task that feeds generator outputs into a function call's `data_out` stream."""
        ...

    async def _queue_create(self, size: int) -> asyncio.queues.Queue:
        """Create a queue, on the synchronicity event loop (needed on Python 3.8 and 3.9)."""
        ...

    async def _queue_put(self, queue: asyncio.queues.Queue, value: typing.Any) -> None:
        """Put a value onto a queue, using the synchronicity event loop."""
        ...

    def get_average_call_time(self) -> float: ...
    def get_max_inputs_to_fetch(self): ...
    def _generate_inputs(
        self, batch_max_size: int, batch_wait_ms: int
    ) -> collections.abc.AsyncIterator[list[tuple[str, int, str, str, modal_proto.api_pb2.FunctionInput]]]: ...
    def run_inputs_outputs(
        self,
        finalized_functions: dict[str, modal._runtime.user_code_imports.FinalizedFunction],
        batch_max_size: int = 0,
        batch_wait_ms: int = 0,
    ) -> collections.abc.AsyncIterator[IOContext]: ...
    async def _send_outputs(self, started_at: float, outputs: list[modal_proto.api_pb2.FunctionPutOutputsItem]) -> None:
        """Send pre-built output items with retry and chunking."""
        ...

    def handle_user_exception(self) -> typing.AsyncContextManager[None]:
        """Sets the task as failed in a way where it's not retried.

        Used for handling exceptions from container lifecycle methods at the moment, which should
        trigger a task failure state.
        """
        ...

    def handle_input_exception(self, io_context: IOContext, started_at: float) -> typing.AsyncContextManager[None]:
        """Handle an exception while processing a function input."""
        ...

    def exit_context(self, started_at, input_ids: list[str]): ...
    async def push_outputs(self, io_context: IOContext, started_at: float, output_data: list[typing.Any]) -> None: ...
    async def memory_restore(self) -> None: ...
    async def memory_snapshot(self) -> None:
        """Message server indicating that function is ready to be checkpointed."""
        ...

    async def volume_commit(self, volume_ids: list[str]) -> None:
        """Perform volume commit for given `volume_ids`.
        Only used on container exit to persist uncommitted changes on behalf of user.
        """
        ...

    async def interact(self, from_breakpoint: bool = False): ...
    @property
    def target_concurrency(self) -> int: ...
    @property
    def max_concurrency(self) -> int: ...
    @property
    def input_concurrency_enabled(self) -> int: ...
    @classmethod
    def get_input_concurrency(cls) -> int:
        """Returns the number of usable input slots.

        If concurrency is reduced, active slots can exceed allotted slots. Returns the larger value
        in this case.
        """
        ...

    @classmethod
    def set_input_concurrency(cls, concurrency: int):
        """Edit the number of input slots.

        This disables the background loop which automatically adjusts concurrency
        within [target_concurrency, max_concurrency].
        """
        ...

    @classmethod
    def stop_fetching_inputs(cls): ...

class ContainerIOManager:
    """Synchronizes all RPC calls and network operations for a running container.

    TODO: maybe we shouldn't synchronize the whole class.
    Then we could potentially move a bunch of the global functions onto it.
    """

    task_id: str
    function_id: str
    app_id: str
    function_def: modal_proto.api_pb2.Function
    checkpoint_id: typing.Optional[str]
    input_plane_server_url: typing.Optional[str]
    calls_completed: int
    total_user_time: float
    current_input_id: typing.Optional[str]
    current_inputs: dict[str, IOContext]
    current_input_started_at: typing.Optional[float]
    _input_concurrency_enabled: bool
    _target_concurrency: int
    _max_concurrency: int
    _concurrency_loop: typing.Optional[asyncio.Task]
    _input_slots: InputSlots
    _environment_name: str
    _heartbeat_loop: typing.Optional[asyncio.Task]
    _heartbeat_condition: typing.Optional[asyncio.locks.Condition]
    _waiting_for_memory_snapshot: bool
    _is_interactivity_enabled: bool
    _fetching_inputs: bool
    _client: modal.client.Client
    _singleton: typing.ClassVar[typing.Optional[ContainerIOManager]]

    def __init__(self, /, *args, **kwargs):
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def _init(self, container_args: modal_proto.api_pb2.ContainerArguments, client: modal.client.Client): ...
    @property
    def heartbeat_condition(self) -> asyncio.locks.Condition: ...
    @classmethod
    def _reset_singleton(cls):
        """Only used for tests."""
        ...

    class __hello_spec(typing_extensions.Protocol):
        def __call__(self, /): ...
        async def aio(self, /): ...

    hello: __hello_spec

    class ___run_heartbeat_loop_spec(typing_extensions.Protocol):
        def __call__(self, /): ...
        async def aio(self, /): ...

    _run_heartbeat_loop: ___run_heartbeat_loop_spec

    class ___heartbeat_handle_cancellations_spec(typing_extensions.Protocol):
        def __call__(self, /) -> bool: ...
        async def aio(self, /) -> bool: ...

    _heartbeat_handle_cancellations: ___heartbeat_handle_cancellations_spec

    class __heartbeats_spec(typing_extensions.Protocol):
        def __call__(
            self, /, wait_for_mem_snap: bool
        ) -> synchronicity.combined_types.AsyncAndBlockingContextManager[None]: ...
        def aio(self, /, wait_for_mem_snap: bool) -> typing.AsyncContextManager[None]: ...

    heartbeats: __heartbeats_spec

    def stop_heartbeat(self): ...

    class __dynamic_concurrency_manager_spec(typing_extensions.Protocol):
        def __call__(self, /) -> synchronicity.combined_types.AsyncAndBlockingContextManager[None]: ...
        def aio(self, /) -> typing.AsyncContextManager[None]: ...

    dynamic_concurrency_manager: __dynamic_concurrency_manager_spec

    class ___dynamic_concurrency_loop_spec(typing_extensions.Protocol):
        def __call__(self, /): ...
        async def aio(self, /): ...

    _dynamic_concurrency_loop: ___dynamic_concurrency_loop_spec

    class __get_data_in_spec(typing_extensions.Protocol):
        def __call__(
            self, /, function_call_id: str, attempt_token: typing.Optional[str]
        ) -> typing.Iterator[typing.Any]:
            """Read from the `data_in` stream of a function call."""
            ...

        def aio(
            self, /, function_call_id: str, attempt_token: typing.Optional[str]
        ) -> collections.abc.AsyncIterator[typing.Any]:
            """Read from the `data_in` stream of a function call."""
            ...

    get_data_in: __get_data_in_spec

    class __put_data_out_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            function_call_id: str,
            attempt_token: str,
            start_index: int,
            data_format: int,
            serialized_messages: list[typing.Any],
        ) -> None:
            """Put data onto the `data_out` stream of a function call.

            This is used for generator outputs, which includes web endpoint responses. Note that this
            was introduced as a performance optimization in client version 0.57, so older clients will
            still use the previous Postgres-backed system based on `FunctionPutOutputs()`.
            """
            ...

        async def aio(
            self,
            /,
            function_call_id: str,
            attempt_token: str,
            start_index: int,
            data_format: int,
            serialized_messages: list[typing.Any],
        ) -> None:
            """Put data onto the `data_out` stream of a function call.

            This is used for generator outputs, which includes web endpoint responses. Note that this
            was introduced as a performance optimization in client version 0.57, so older clients will
            still use the previous Postgres-backed system based on `FunctionPutOutputs()`.
            """
            ...

    put_data_out: __put_data_out_spec

    class __generator_output_sender_spec(typing_extensions.Protocol):
        def __call__(
            self, /, function_call_id: str, attempt_token: str, data_format: int, message_rx: asyncio.queues.Queue
        ) -> synchronicity.combined_types.AsyncAndBlockingContextManager[None]:
            """Runs background task that feeds generator outputs into a function call's `data_out` stream."""
            ...

        def aio(
            self, /, function_call_id: str, attempt_token: str, data_format: int, message_rx: asyncio.queues.Queue
        ) -> typing.AsyncContextManager[None]:
            """Runs background task that feeds generator outputs into a function call's `data_out` stream."""
            ...

    generator_output_sender: __generator_output_sender_spec

    class ___queue_create_spec(typing_extensions.Protocol):
        def __call__(self, /, size: int) -> asyncio.queues.Queue:
            """Create a queue, on the synchronicity event loop (needed on Python 3.8 and 3.9)."""
            ...

        async def aio(self, /, size: int) -> asyncio.queues.Queue:
            """Create a queue, on the synchronicity event loop (needed on Python 3.8 and 3.9)."""
            ...

    _queue_create: ___queue_create_spec

    class ___queue_put_spec(typing_extensions.Protocol):
        def __call__(self, /, queue: asyncio.queues.Queue, value: typing.Any) -> None:
            """Put a value onto a queue, using the synchronicity event loop."""
            ...

        async def aio(self, /, queue: asyncio.queues.Queue, value: typing.Any) -> None:
            """Put a value onto a queue, using the synchronicity event loop."""
            ...

    _queue_put: ___queue_put_spec

    def get_average_call_time(self) -> float: ...
    def get_max_inputs_to_fetch(self): ...

    class ___generate_inputs_spec(typing_extensions.Protocol):
        def __call__(
            self, /, batch_max_size: int, batch_wait_ms: int
        ) -> typing.Iterator[list[tuple[str, int, str, str, modal_proto.api_pb2.FunctionInput]]]: ...
        def aio(
            self, /, batch_max_size: int, batch_wait_ms: int
        ) -> collections.abc.AsyncIterator[list[tuple[str, int, str, str, modal_proto.api_pb2.FunctionInput]]]: ...

    _generate_inputs: ___generate_inputs_spec

    class __run_inputs_outputs_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            finalized_functions: dict[str, modal._runtime.user_code_imports.FinalizedFunction],
            batch_max_size: int = 0,
            batch_wait_ms: int = 0,
        ) -> typing.Iterator[IOContext]: ...
        def aio(
            self,
            /,
            finalized_functions: dict[str, modal._runtime.user_code_imports.FinalizedFunction],
            batch_max_size: int = 0,
            batch_wait_ms: int = 0,
        ) -> collections.abc.AsyncIterator[IOContext]: ...

    run_inputs_outputs: __run_inputs_outputs_spec

    class ___send_outputs_spec(typing_extensions.Protocol):
        def __call__(self, /, started_at: float, outputs: list[modal_proto.api_pb2.FunctionPutOutputsItem]) -> None:
            """Send pre-built output items with retry and chunking."""
            ...

        async def aio(self, /, started_at: float, outputs: list[modal_proto.api_pb2.FunctionPutOutputsItem]) -> None:
            """Send pre-built output items with retry and chunking."""
            ...

    _send_outputs: ___send_outputs_spec

    class __handle_user_exception_spec(typing_extensions.Protocol):
        def __call__(self, /) -> synchronicity.combined_types.AsyncAndBlockingContextManager[None]:
            """Sets the task as failed in a way where it's not retried.

            Used for handling exceptions from container lifecycle methods at the moment, which should
            trigger a task failure state.
            """
            ...

        def aio(self, /) -> typing.AsyncContextManager[None]:
            """Sets the task as failed in a way where it's not retried.

            Used for handling exceptions from container lifecycle methods at the moment, which should
            trigger a task failure state.
            """
            ...

    handle_user_exception: __handle_user_exception_spec

    class __handle_input_exception_spec(typing_extensions.Protocol):
        def __call__(
            self, /, io_context: IOContext, started_at: float
        ) -> synchronicity.combined_types.AsyncAndBlockingContextManager[None]:
            """Handle an exception while processing a function input."""
            ...

        def aio(self, /, io_context: IOContext, started_at: float) -> typing.AsyncContextManager[None]:
            """Handle an exception while processing a function input."""
            ...

    handle_input_exception: __handle_input_exception_spec

    def exit_context(self, started_at, input_ids: list[str]): ...

    class __push_outputs_spec(typing_extensions.Protocol):
        def __call__(self, /, io_context: IOContext, started_at: float, output_data: list[typing.Any]) -> None: ...
        async def aio(self, /, io_context: IOContext, started_at: float, output_data: list[typing.Any]) -> None: ...

    push_outputs: __push_outputs_spec

    class __memory_restore_spec(typing_extensions.Protocol):
        def __call__(self, /) -> None: ...
        async def aio(self, /) -> None: ...

    memory_restore: __memory_restore_spec

    class __memory_snapshot_spec(typing_extensions.Protocol):
        def __call__(self, /) -> None:
            """Message server indicating that function is ready to be checkpointed."""
            ...

        async def aio(self, /) -> None:
            """Message server indicating that function is ready to be checkpointed."""
            ...

    memory_snapshot: __memory_snapshot_spec

    class __volume_commit_spec(typing_extensions.Protocol):
        def __call__(self, /, volume_ids: list[str]) -> None:
            """Perform volume commit for given `volume_ids`.
            Only used on container exit to persist uncommitted changes on behalf of user.
            """
            ...

        async def aio(self, /, volume_ids: list[str]) -> None:
            """Perform volume commit for given `volume_ids`.
            Only used on container exit to persist uncommitted changes on behalf of user.
            """
            ...

    volume_commit: __volume_commit_spec

    class __interact_spec(typing_extensions.Protocol):
        def __call__(self, /, from_breakpoint: bool = False): ...
        async def aio(self, /, from_breakpoint: bool = False): ...

    interact: __interact_spec

    @property
    def target_concurrency(self) -> int: ...
    @property
    def max_concurrency(self) -> int: ...
    @property
    def input_concurrency_enabled(self) -> int: ...
    @classmethod
    def get_input_concurrency(cls) -> int:
        """Returns the number of usable input slots.

        If concurrency is reduced, active slots can exceed allotted slots. Returns the larger value
        in this case.
        """
        ...

    @classmethod
    def set_input_concurrency(cls, concurrency: int):
        """Edit the number of input slots.

        This disables the background loop which automatically adjusts concurrency
        within [target_concurrency, max_concurrency].
        """
        ...

    @classmethod
    def stop_fetching_inputs(cls): ...

def check_fastapi_pydantic_compatibility(exc: ImportError) -> None:
    """Add a helpful note to an exception that is likely caused by a pydantic<>fastapi version incompatibility.

    We need this becasue the legacy set of container requirements (image_builder_version=2023.12) contains a
    version of fastapi that is not forwards-compatible with pydantic 2.0+, and users commonly run into issues
    building an image that specifies a more recent version only for pydantic.
    """
    ...

MAX_OUTPUT_BATCH_SIZE: int

RTT_S: float
