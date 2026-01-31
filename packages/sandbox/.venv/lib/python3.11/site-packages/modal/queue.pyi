import collections.abc
import datetime
import google.protobuf.message
import modal._object
import modal.client
import modal.object
import modal_proto.api_pb2
import synchronicity
import synchronicity.combined_types
import typing
import typing_extensions

class QueueInfo:
    """Information about the Queue object."""

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

class _QueueManager:
    """Namespace with methods for managing named Queue objects."""
    @staticmethod
    async def create(
        name: str,
        *,
        allow_existing: bool = False,
        environment_name: typing.Optional[str] = None,
        client: typing.Optional[modal.client._Client] = None,
    ) -> None:
        """Create a new Queue object.

        **Examples:**

        ```python notest
        modal.Queue.objects.create("my-queue")
        ```

        Queues will be created in the active environment, or another one can be specified:

        ```python notest
        modal.Queue.objects.create("my-queue", environment_name="dev")
        ```

        By default, an error will be raised if the Queue already exists, but passing
        `allow_existing=True` will make the creation attempt a no-op in this case.

        ```python notest
        modal.Queue.objects.create("my-queue", allow_existing=True)
        ```

        Note that this method does not return a local instance of the Queue. You can use
        `modal.Queue.from_name` to perform a lookup after creation.

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
    ) -> list[_Queue]:
        """Return a list of hydrated Queue objects.

        **Examples:**

        ```python
        queues = modal.Queue.objects.list()
        print([q.name for q in queues])
        ```

        Queues will be retreived from the active environment, or another one can be specified:

        ```python notest
        dev_queues = modal.Queue.objects.list(environment_name="dev")
        ```

        By default, all named Queues are returned, newest to oldest. It's also possible to limit the
        number of results and to filter by creation date:

        ```python
        queues = modal.Queue.objects.list(max_objects=10, created_before="2025-01-01")
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
        """Delete a named Queue.

        Warning: This deletes an *entire Queue*, not just a specific entry or partition.
        Deletion is irreversible and will affect any Apps currently using the Queue.

        **Examples:**

        ```python notest
        await modal.Queue.objects.delete("my-queue")
        ```

        Queues will be deleted from the active environment, or another one can be specified:

        ```python notest
        await modal.Queue.objects.delete("my-queue", environment_name="dev")
        ```

        Added in v1.1.2.
        """
        ...

class QueueManager:
    """Namespace with methods for managing named Queue objects."""
    def __init__(self, /, *args, **kwargs):
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    class __create_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            name: str,
            *,
            allow_existing: bool = False,
            environment_name: typing.Optional[str] = None,
            client: typing.Optional[modal.client.Client] = None,
        ) -> None:
            """Create a new Queue object.

            **Examples:**

            ```python notest
            modal.Queue.objects.create("my-queue")
            ```

            Queues will be created in the active environment, or another one can be specified:

            ```python notest
            modal.Queue.objects.create("my-queue", environment_name="dev")
            ```

            By default, an error will be raised if the Queue already exists, but passing
            `allow_existing=True` will make the creation attempt a no-op in this case.

            ```python notest
            modal.Queue.objects.create("my-queue", allow_existing=True)
            ```

            Note that this method does not return a local instance of the Queue. You can use
            `modal.Queue.from_name` to perform a lookup after creation.

            Added in v1.1.2.
            """
            ...

        async def aio(
            self,
            /,
            name: str,
            *,
            allow_existing: bool = False,
            environment_name: typing.Optional[str] = None,
            client: typing.Optional[modal.client.Client] = None,
        ) -> None:
            """Create a new Queue object.

            **Examples:**

            ```python notest
            modal.Queue.objects.create("my-queue")
            ```

            Queues will be created in the active environment, or another one can be specified:

            ```python notest
            modal.Queue.objects.create("my-queue", environment_name="dev")
            ```

            By default, an error will be raised if the Queue already exists, but passing
            `allow_existing=True` will make the creation attempt a no-op in this case.

            ```python notest
            modal.Queue.objects.create("my-queue", allow_existing=True)
            ```

            Note that this method does not return a local instance of the Queue. You can use
            `modal.Queue.from_name` to perform a lookup after creation.

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
        ) -> list[Queue]:
            """Return a list of hydrated Queue objects.

            **Examples:**

            ```python
            queues = modal.Queue.objects.list()
            print([q.name for q in queues])
            ```

            Queues will be retreived from the active environment, or another one can be specified:

            ```python notest
            dev_queues = modal.Queue.objects.list(environment_name="dev")
            ```

            By default, all named Queues are returned, newest to oldest. It's also possible to limit the
            number of results and to filter by creation date:

            ```python
            queues = modal.Queue.objects.list(max_objects=10, created_before="2025-01-01")
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
        ) -> list[Queue]:
            """Return a list of hydrated Queue objects.

            **Examples:**

            ```python
            queues = modal.Queue.objects.list()
            print([q.name for q in queues])
            ```

            Queues will be retreived from the active environment, or another one can be specified:

            ```python notest
            dev_queues = modal.Queue.objects.list(environment_name="dev")
            ```

            By default, all named Queues are returned, newest to oldest. It's also possible to limit the
            number of results and to filter by creation date:

            ```python
            queues = modal.Queue.objects.list(max_objects=10, created_before="2025-01-01")
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
            """Delete a named Queue.

            Warning: This deletes an *entire Queue*, not just a specific entry or partition.
            Deletion is irreversible and will affect any Apps currently using the Queue.

            **Examples:**

            ```python notest
            await modal.Queue.objects.delete("my-queue")
            ```

            Queues will be deleted from the active environment, or another one can be specified:

            ```python notest
            await modal.Queue.objects.delete("my-queue", environment_name="dev")
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
            """Delete a named Queue.

            Warning: This deletes an *entire Queue*, not just a specific entry or partition.
            Deletion is irreversible and will affect any Apps currently using the Queue.

            **Examples:**

            ```python notest
            await modal.Queue.objects.delete("my-queue")
            ```

            Queues will be deleted from the active environment, or another one can be specified:

            ```python notest
            await modal.Queue.objects.delete("my-queue", environment_name="dev")
            ```

            Added in v1.1.2.
            """
            ...

    delete: typing.ClassVar[__delete_spec]

class _Queue(modal._object._Object):
    """Distributed, FIFO queue for data flow in Modal apps.

    The queue can contain any object serializable by `cloudpickle`, including Modal objects.

    By default, the `Queue` object acts as a single FIFO queue which supports puts and gets (blocking and non-blocking).

    **Usage**

    ```python
    from modal import Queue

    # Create an ephemeral queue which is anonymous and garbage collected
    with Queue.ephemeral() as my_queue:
        # Putting values
        my_queue.put("some value")
        my_queue.put(123)

        # Getting values
        assert my_queue.get() == "some value"
        assert my_queue.get() == 123

        # Using partitions
        my_queue.put(0)
        my_queue.put(1, partition="foo")
        my_queue.put(2, partition="bar")

        # Default and "foo" partition are ignored by the get operation.
        assert my_queue.get(partition="bar") == 2

        # Set custom 10s expiration time on "foo" partition.
        my_queue.put(3, partition="foo", partition_ttl=10)

        # (beta feature) Iterate through items in place (read immutably)
        my_queue.put(1)
        assert [v for v in my_queue.iterate()] == [0, 1]

    # You can also create persistent queues that can be used across apps
    queue = Queue.from_name("my-persisted-queue", create_if_missing=True)
    queue.put(42)
    assert queue.get() == 42
    ```

    For more examples, see the [guide](https://modal.com/docs/guide/dicts-and-queues#modal-queues).

    **Queue partitions (beta)**

    Specifying partition keys gives access to other independent FIFO partitions within the same `Queue` object.
    Across any two partitions, puts and gets are completely independent.
    For example, a put in one partition does not affect a get in any other partition.

    When no partition key is specified (by default), puts and gets will operate on a default partition.
    This default partition is also isolated from all other partitions.
    Please see the Usage section below for an example using partitions.

    **Lifetime of a queue and its partitions**

    By default, each partition is cleared 24 hours after the last `put` operation.
    A lower TTL can be specified by the `partition_ttl` argument in the `put` or `put_many` methods.
    Each partition's expiry is handled independently.

    As such, `Queue`s are best used for communication between active functions and not relied on for persistent storage.

    On app completion or after stopping an app any associated `Queue` objects are cleaned up.
    All its partitions will be cleared.

    **Limits**

    A single `Queue` can contain up to 100,000 partitions, each with up to 5,000 items. Each item can be up to 1 MiB.

    Partition keys must be non-empty and must not exceed 64 bytes.
    """

    _metadata: typing.Optional[modal_proto.api_pb2.QueueMetadata]

    def __init__(self):
        """mdmd:hidden"""
        ...

    @synchronicity.classproperty
    def objects(cls) -> _QueueManager: ...
    @property
    def name(self) -> typing.Optional[str]: ...
    def _hydrate_metadata(self, metadata: typing.Optional[google.protobuf.message.Message]): ...
    def _get_metadata(self) -> modal_proto.api_pb2.QueueMetadata: ...
    @staticmethod
    def validate_partition_key(partition: typing.Optional[str]) -> bytes: ...
    @classmethod
    def ephemeral(
        cls: type[_Queue],
        client: typing.Optional[modal.client._Client] = None,
        environment_name: typing.Optional[str] = None,
        _heartbeat_sleep: float = 300,
    ) -> typing.AsyncContextManager[_Queue]:
        """Creates a new ephemeral queue within a context manager:

        Usage:
        ```python
        from modal import Queue

        with Queue.ephemeral() as q:
            q.put(123)
        ```

        ```python notest
        async with Queue.ephemeral() as q:
            await q.put.aio(123)
        ```
        """
        ...

    @staticmethod
    def from_name(
        name: str,
        *,
        namespace=None,
        environment_name: typing.Optional[str] = None,
        create_if_missing: bool = False,
        client: typing.Optional[modal.client._Client] = None,
    ) -> _Queue:
        """Reference a named Queue, creating if necessary.

        This is a lazy method the defers hydrating the local
        object with metadata from Modal servers until the first
        time it is actually used.

        ```python
        q = modal.Queue.from_name("my-queue", create_if_missing=True)
        q.put(123)
        ```
        """
        ...

    @staticmethod
    async def delete(
        name: str,
        *,
        client: typing.Optional[modal.client._Client] = None,
        environment_name: typing.Optional[str] = None,
    ):
        """mdmd:hidden
        Delete a named Queue.

        Warning: This deletes an *entire Queue*, not just a specific entry or partition.
        Deletion is irreversible and will affect any Apps currently using the Queue.

        DEPRECATED: This method is deprecated; we recommend using `modal.Queue.objects.delete` instead.
        """
        ...

    async def info(self) -> QueueInfo:
        """Return information about the Queue object."""
        ...

    async def _get_nonblocking(self, partition: typing.Optional[str], n_values: int) -> list[typing.Any]: ...
    async def _get_blocking(
        self, partition: typing.Optional[str], timeout: typing.Optional[float], n_values: int
    ) -> list[typing.Any]: ...
    async def clear(self, *, partition: typing.Optional[str] = None, all: bool = False) -> None:
        """Clear the contents of a single partition or all partitions.

        Warning: this is a destructive operation and will irrevocably delete data.

        **Examples:**

        ```python
        q = modal.Queue.from_name("my-queue", create_if_missing=True)
        q.clear()
        ```
        """
        ...

    async def get(
        self, block: bool = True, timeout: typing.Optional[float] = None, *, partition: typing.Optional[str] = None
    ) -> typing.Optional[typing.Any]:
        """Remove and return the next object in the queue.

        If `block` is `True` (the default) and the queue is empty, `get` will wait indefinitely for
        an object, or until `timeout` if specified. Raises a native `queue.Empty` exception
        if the `timeout` is reached.

        If `block` is `False`, `get` returns `None` immediately if the queue is empty. The `timeout` is
        ignored in this case.
        """
        ...

    async def get_many(
        self,
        n_values: int,
        block: bool = True,
        timeout: typing.Optional[float] = None,
        *,
        partition: typing.Optional[str] = None,
    ) -> list[typing.Any]:
        """Remove and return up to `n_values` objects from the queue.

        If there are fewer than `n_values` items in the queue, return all of them.

        If `block` is `True` (the default) and the queue is empty, `get` will wait indefinitely for
        at least 1 object to be present, or until `timeout` if specified. Raises the stdlib's `queue.Empty`
        exception if the `timeout` is reached.

        If `block` is `False`, `get` returns `None` immediately if the queue is empty. The `timeout` is
        ignored in this case.
        """
        ...

    async def put(
        self,
        v: typing.Any,
        block: bool = True,
        timeout: typing.Optional[float] = None,
        *,
        partition: typing.Optional[str] = None,
        partition_ttl: int = 86400,
    ) -> None:
        """Add an object to the end of the queue.

        If `block` is `True` and the queue is full, this method will retry indefinitely or
        until `timeout` if specified. Raises the stdlib's `queue.Full` exception if the `timeout` is reached.
        If blocking it is not recommended to omit the `timeout`, as the operation could wait indefinitely.

        If `block` is `False`, this method raises `queue.Full` immediately if the queue is full. The `timeout` is
        ignored in this case.
        """
        ...

    async def put_many(
        self,
        vs: list[typing.Any],
        block: bool = True,
        timeout: typing.Optional[float] = None,
        *,
        partition: typing.Optional[str] = None,
        partition_ttl: int = 86400,
    ) -> None:
        """Add several objects to the end of the queue.

        If `block` is `True` and the queue is full, this method will retry indefinitely or
        until `timeout` if specified. Raises the stdlib's `queue.Full` exception if the `timeout` is reached.
        If blocking it is not recommended to omit the `timeout`, as the operation could wait indefinitely.

        If `block` is `False`, this method raises `queue.Full` immediately if the queue is full. The `timeout` is
        ignored in this case.
        """
        ...

    async def _put_many_blocking(
        self,
        partition: typing.Optional[str],
        partition_ttl: int,
        vs: list[typing.Any],
        timeout: typing.Optional[float] = None,
    ): ...
    async def _put_many_nonblocking(
        self, partition: typing.Optional[str], partition_ttl: int, vs: list[typing.Any]
    ): ...
    async def len(self, *, partition: typing.Optional[str] = None, total: bool = False) -> int:
        """Return the number of objects in the queue partition."""
        ...

    def iterate(
        self, *, partition: typing.Optional[str] = None, item_poll_timeout: float = 0.0
    ) -> collections.abc.AsyncGenerator[typing.Any, None]:
        """(Beta feature) Iterate through items in the queue without mutation.

        Specify `item_poll_timeout` to control how long the iterator should wait for the next time before giving up.
        """
        ...

class Queue(modal.object.Object):
    """Distributed, FIFO queue for data flow in Modal apps.

    The queue can contain any object serializable by `cloudpickle`, including Modal objects.

    By default, the `Queue` object acts as a single FIFO queue which supports puts and gets (blocking and non-blocking).

    **Usage**

    ```python
    from modal import Queue

    # Create an ephemeral queue which is anonymous and garbage collected
    with Queue.ephemeral() as my_queue:
        # Putting values
        my_queue.put("some value")
        my_queue.put(123)

        # Getting values
        assert my_queue.get() == "some value"
        assert my_queue.get() == 123

        # Using partitions
        my_queue.put(0)
        my_queue.put(1, partition="foo")
        my_queue.put(2, partition="bar")

        # Default and "foo" partition are ignored by the get operation.
        assert my_queue.get(partition="bar") == 2

        # Set custom 10s expiration time on "foo" partition.
        my_queue.put(3, partition="foo", partition_ttl=10)

        # (beta feature) Iterate through items in place (read immutably)
        my_queue.put(1)
        assert [v for v in my_queue.iterate()] == [0, 1]

    # You can also create persistent queues that can be used across apps
    queue = Queue.from_name("my-persisted-queue", create_if_missing=True)
    queue.put(42)
    assert queue.get() == 42
    ```

    For more examples, see the [guide](https://modal.com/docs/guide/dicts-and-queues#modal-queues).

    **Queue partitions (beta)**

    Specifying partition keys gives access to other independent FIFO partitions within the same `Queue` object.
    Across any two partitions, puts and gets are completely independent.
    For example, a put in one partition does not affect a get in any other partition.

    When no partition key is specified (by default), puts and gets will operate on a default partition.
    This default partition is also isolated from all other partitions.
    Please see the Usage section below for an example using partitions.

    **Lifetime of a queue and its partitions**

    By default, each partition is cleared 24 hours after the last `put` operation.
    A lower TTL can be specified by the `partition_ttl` argument in the `put` or `put_many` methods.
    Each partition's expiry is handled independently.

    As such, `Queue`s are best used for communication between active functions and not relied on for persistent storage.

    On app completion or after stopping an app any associated `Queue` objects are cleaned up.
    All its partitions will be cleared.

    **Limits**

    A single `Queue` can contain up to 100,000 partitions, each with up to 5,000 items. Each item can be up to 1 MiB.

    Partition keys must be non-empty and must not exceed 64 bytes.
    """

    _metadata: typing.Optional[modal_proto.api_pb2.QueueMetadata]

    def __init__(self):
        """mdmd:hidden"""
        ...

    @synchronicity.classproperty
    def objects(cls) -> QueueManager: ...
    @property
    def name(self) -> typing.Optional[str]: ...
    def _hydrate_metadata(self, metadata: typing.Optional[google.protobuf.message.Message]): ...
    def _get_metadata(self) -> modal_proto.api_pb2.QueueMetadata: ...
    @staticmethod
    def validate_partition_key(partition: typing.Optional[str]) -> bytes: ...

    class __ephemeral_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
            _heartbeat_sleep: float = 300,
        ) -> synchronicity.combined_types.AsyncAndBlockingContextManager[Queue]:
            """Creates a new ephemeral queue within a context manager:

            Usage:
            ```python
            from modal import Queue

            with Queue.ephemeral() as q:
                q.put(123)
            ```

            ```python notest
            async with Queue.ephemeral() as q:
                await q.put.aio(123)
            ```
            """
            ...

        def aio(
            self,
            /,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
            _heartbeat_sleep: float = 300,
        ) -> typing.AsyncContextManager[Queue]:
            """Creates a new ephemeral queue within a context manager:

            Usage:
            ```python
            from modal import Queue

            with Queue.ephemeral() as q:
                q.put(123)
            ```

            ```python notest
            async with Queue.ephemeral() as q:
                await q.put.aio(123)
            ```
            """
            ...

    ephemeral: typing.ClassVar[__ephemeral_spec]

    @staticmethod
    def from_name(
        name: str,
        *,
        namespace=None,
        environment_name: typing.Optional[str] = None,
        create_if_missing: bool = False,
        client: typing.Optional[modal.client.Client] = None,
    ) -> Queue:
        """Reference a named Queue, creating if necessary.

        This is a lazy method the defers hydrating the local
        object with metadata from Modal servers until the first
        time it is actually used.

        ```python
        q = modal.Queue.from_name("my-queue", create_if_missing=True)
        q.put(123)
        ```
        """
        ...

    class __delete_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            name: str,
            *,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
        ):
            """mdmd:hidden
            Delete a named Queue.

            Warning: This deletes an *entire Queue*, not just a specific entry or partition.
            Deletion is irreversible and will affect any Apps currently using the Queue.

            DEPRECATED: This method is deprecated; we recommend using `modal.Queue.objects.delete` instead.
            """
            ...

        async def aio(
            self,
            /,
            name: str,
            *,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
        ):
            """mdmd:hidden
            Delete a named Queue.

            Warning: This deletes an *entire Queue*, not just a specific entry or partition.
            Deletion is irreversible and will affect any Apps currently using the Queue.

            DEPRECATED: This method is deprecated; we recommend using `modal.Queue.objects.delete` instead.
            """
            ...

    delete: typing.ClassVar[__delete_spec]

    class __info_spec(typing_extensions.Protocol):
        def __call__(self, /) -> QueueInfo:
            """Return information about the Queue object."""
            ...

        async def aio(self, /) -> QueueInfo:
            """Return information about the Queue object."""
            ...

    info: __info_spec

    class ___get_nonblocking_spec(typing_extensions.Protocol):
        def __call__(self, /, partition: typing.Optional[str], n_values: int) -> list[typing.Any]: ...
        async def aio(self, /, partition: typing.Optional[str], n_values: int) -> list[typing.Any]: ...

    _get_nonblocking: ___get_nonblocking_spec

    class ___get_blocking_spec(typing_extensions.Protocol):
        def __call__(
            self, /, partition: typing.Optional[str], timeout: typing.Optional[float], n_values: int
        ) -> list[typing.Any]: ...
        async def aio(
            self, /, partition: typing.Optional[str], timeout: typing.Optional[float], n_values: int
        ) -> list[typing.Any]: ...

    _get_blocking: ___get_blocking_spec

    class __clear_spec(typing_extensions.Protocol):
        def __call__(self, /, *, partition: typing.Optional[str] = None, all: bool = False) -> None:
            """Clear the contents of a single partition or all partitions.

            Warning: this is a destructive operation and will irrevocably delete data.

            **Examples:**

            ```python
            q = modal.Queue.from_name("my-queue", create_if_missing=True)
            q.clear()
            ```
            """
            ...

        async def aio(self, /, *, partition: typing.Optional[str] = None, all: bool = False) -> None:
            """Clear the contents of a single partition or all partitions.

            Warning: this is a destructive operation and will irrevocably delete data.

            **Examples:**

            ```python
            q = modal.Queue.from_name("my-queue", create_if_missing=True)
            q.clear()
            ```
            """
            ...

    clear: __clear_spec

    class __get_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            block: bool = True,
            timeout: typing.Optional[float] = None,
            *,
            partition: typing.Optional[str] = None,
        ) -> typing.Optional[typing.Any]:
            """Remove and return the next object in the queue.

            If `block` is `True` (the default) and the queue is empty, `get` will wait indefinitely for
            an object, or until `timeout` if specified. Raises a native `queue.Empty` exception
            if the `timeout` is reached.

            If `block` is `False`, `get` returns `None` immediately if the queue is empty. The `timeout` is
            ignored in this case.
            """
            ...

        async def aio(
            self,
            /,
            block: bool = True,
            timeout: typing.Optional[float] = None,
            *,
            partition: typing.Optional[str] = None,
        ) -> typing.Optional[typing.Any]:
            """Remove and return the next object in the queue.

            If `block` is `True` (the default) and the queue is empty, `get` will wait indefinitely for
            an object, or until `timeout` if specified. Raises a native `queue.Empty` exception
            if the `timeout` is reached.

            If `block` is `False`, `get` returns `None` immediately if the queue is empty. The `timeout` is
            ignored in this case.
            """
            ...

    get: __get_spec

    class __get_many_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            n_values: int,
            block: bool = True,
            timeout: typing.Optional[float] = None,
            *,
            partition: typing.Optional[str] = None,
        ) -> list[typing.Any]:
            """Remove and return up to `n_values` objects from the queue.

            If there are fewer than `n_values` items in the queue, return all of them.

            If `block` is `True` (the default) and the queue is empty, `get` will wait indefinitely for
            at least 1 object to be present, or until `timeout` if specified. Raises the stdlib's `queue.Empty`
            exception if the `timeout` is reached.

            If `block` is `False`, `get` returns `None` immediately if the queue is empty. The `timeout` is
            ignored in this case.
            """
            ...

        async def aio(
            self,
            /,
            n_values: int,
            block: bool = True,
            timeout: typing.Optional[float] = None,
            *,
            partition: typing.Optional[str] = None,
        ) -> list[typing.Any]:
            """Remove and return up to `n_values` objects from the queue.

            If there are fewer than `n_values` items in the queue, return all of them.

            If `block` is `True` (the default) and the queue is empty, `get` will wait indefinitely for
            at least 1 object to be present, or until `timeout` if specified. Raises the stdlib's `queue.Empty`
            exception if the `timeout` is reached.

            If `block` is `False`, `get` returns `None` immediately if the queue is empty. The `timeout` is
            ignored in this case.
            """
            ...

    get_many: __get_many_spec

    class __put_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            v: typing.Any,
            block: bool = True,
            timeout: typing.Optional[float] = None,
            *,
            partition: typing.Optional[str] = None,
            partition_ttl: int = 86400,
        ) -> None:
            """Add an object to the end of the queue.

            If `block` is `True` and the queue is full, this method will retry indefinitely or
            until `timeout` if specified. Raises the stdlib's `queue.Full` exception if the `timeout` is reached.
            If blocking it is not recommended to omit the `timeout`, as the operation could wait indefinitely.

            If `block` is `False`, this method raises `queue.Full` immediately if the queue is full. The `timeout` is
            ignored in this case.
            """
            ...

        async def aio(
            self,
            /,
            v: typing.Any,
            block: bool = True,
            timeout: typing.Optional[float] = None,
            *,
            partition: typing.Optional[str] = None,
            partition_ttl: int = 86400,
        ) -> None:
            """Add an object to the end of the queue.

            If `block` is `True` and the queue is full, this method will retry indefinitely or
            until `timeout` if specified. Raises the stdlib's `queue.Full` exception if the `timeout` is reached.
            If blocking it is not recommended to omit the `timeout`, as the operation could wait indefinitely.

            If `block` is `False`, this method raises `queue.Full` immediately if the queue is full. The `timeout` is
            ignored in this case.
            """
            ...

    put: __put_spec

    class __put_many_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            vs: list[typing.Any],
            block: bool = True,
            timeout: typing.Optional[float] = None,
            *,
            partition: typing.Optional[str] = None,
            partition_ttl: int = 86400,
        ) -> None:
            """Add several objects to the end of the queue.

            If `block` is `True` and the queue is full, this method will retry indefinitely or
            until `timeout` if specified. Raises the stdlib's `queue.Full` exception if the `timeout` is reached.
            If blocking it is not recommended to omit the `timeout`, as the operation could wait indefinitely.

            If `block` is `False`, this method raises `queue.Full` immediately if the queue is full. The `timeout` is
            ignored in this case.
            """
            ...

        async def aio(
            self,
            /,
            vs: list[typing.Any],
            block: bool = True,
            timeout: typing.Optional[float] = None,
            *,
            partition: typing.Optional[str] = None,
            partition_ttl: int = 86400,
        ) -> None:
            """Add several objects to the end of the queue.

            If `block` is `True` and the queue is full, this method will retry indefinitely or
            until `timeout` if specified. Raises the stdlib's `queue.Full` exception if the `timeout` is reached.
            If blocking it is not recommended to omit the `timeout`, as the operation could wait indefinitely.

            If `block` is `False`, this method raises `queue.Full` immediately if the queue is full. The `timeout` is
            ignored in this case.
            """
            ...

    put_many: __put_many_spec

    class ___put_many_blocking_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            partition: typing.Optional[str],
            partition_ttl: int,
            vs: list[typing.Any],
            timeout: typing.Optional[float] = None,
        ): ...
        async def aio(
            self,
            /,
            partition: typing.Optional[str],
            partition_ttl: int,
            vs: list[typing.Any],
            timeout: typing.Optional[float] = None,
        ): ...

    _put_many_blocking: ___put_many_blocking_spec

    class ___put_many_nonblocking_spec(typing_extensions.Protocol):
        def __call__(self, /, partition: typing.Optional[str], partition_ttl: int, vs: list[typing.Any]): ...
        async def aio(self, /, partition: typing.Optional[str], partition_ttl: int, vs: list[typing.Any]): ...

    _put_many_nonblocking: ___put_many_nonblocking_spec

    class __len_spec(typing_extensions.Protocol):
        def __call__(self, /, *, partition: typing.Optional[str] = None, total: bool = False) -> int:
            """Return the number of objects in the queue partition."""
            ...

        async def aio(self, /, *, partition: typing.Optional[str] = None, total: bool = False) -> int:
            """Return the number of objects in the queue partition."""
            ...

    len: __len_spec

    class __iterate_spec(typing_extensions.Protocol):
        def __call__(
            self, /, *, partition: typing.Optional[str] = None, item_poll_timeout: float = 0.0
        ) -> typing.Generator[typing.Any, None, None]:
            """(Beta feature) Iterate through items in the queue without mutation.

            Specify `item_poll_timeout` to control how long the iterator should wait for the next time before giving up.
            """
            ...

        def aio(
            self, /, *, partition: typing.Optional[str] = None, item_poll_timeout: float = 0.0
        ) -> collections.abc.AsyncGenerator[typing.Any, None]:
            """(Beta feature) Iterate through items in the queue without mutation.

            Specify `item_poll_timeout` to control how long the iterator should wait for the next time before giving up.
            """
            ...

    iterate: __iterate_spec
