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

class _NoDefaultSentinel:
    def __repr__(self) -> str:
        """Return repr(self)."""
        ...

_NO_DEFAULT: _NoDefaultSentinel

def _serialize_dict(data): ...
def _deserialize_dict_key(dict: _Dict, data: bytes) -> typing.Any: ...
def _deserialize_dict_value(dict: _Dict, data: bytes, key: typing.Any = ...) -> typing.Any: ...

class DictInfo:
    """Information about a Dict object."""

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

class _DictManager:
    """Namespace with methods for managing named Dict objects."""
    @staticmethod
    async def create(
        name: str,
        *,
        allow_existing: bool = False,
        environment_name: typing.Optional[str] = None,
        client: typing.Optional[modal.client._Client] = None,
    ) -> None:
        """Create a new Dict object.

        **Examples:**

        ```python notest
        modal.Dict.objects.create("my-dict")
        ```

        Dicts will be created in the active environment, or another one can be specified:

        ```python notest
        modal.Dict.objects.create("my-dict", environment_name="dev")
        ```

        By default, an error will be raised if the Dict already exists, but passing
        `allow_existing=True` will make the creation attempt a no-op in this case.

        ```python notest
        modal.Dict.objects.create("my-dict", allow_existing=True)
        ```

        Note that this method does not return a local instance of the Dict. You can use
        `modal.Dict.from_name` to perform a lookup after creation.

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
    ) -> list[_Dict]:
        """Return a list of hydrated Dict objects.

        **Examples:**

        ```python
        dicts = modal.Dict.objects.list()
        print([d.name for d in dicts])
        ```

        Dicts will be retreived from the active environment, or another one can be specified:

        ```python notest
        dev_dicts = modal.Dict.objects.list(environment_name="dev")
        ```

        By default, all named Dict are returned, newest to oldest. It's also possible to limit the
        number of results and to filter by creation date:

        ```python
        dicts = modal.Dict.objects.list(max_objects=10, created_before="2025-01-01")
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
        """Delete a named Dict.

        Warning: This deletes an *entire Dict*, not just a specific key.
        Deletion is irreversible and will affect any Apps currently using the Dict.

        **Examples:**

        ```python notest
        await modal.Dict.objects.delete("my-dict")
        ```

        Dicts will be deleted from the active environment, or another one can be specified:

        ```python notest
        await modal.Dict.objects.delete("my-dict", environment_name="dev")
        ```

        Added in v1.1.2.
        """
        ...

class DictManager:
    """Namespace with methods for managing named Dict objects."""
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
            """Create a new Dict object.

            **Examples:**

            ```python notest
            modal.Dict.objects.create("my-dict")
            ```

            Dicts will be created in the active environment, or another one can be specified:

            ```python notest
            modal.Dict.objects.create("my-dict", environment_name="dev")
            ```

            By default, an error will be raised if the Dict already exists, but passing
            `allow_existing=True` will make the creation attempt a no-op in this case.

            ```python notest
            modal.Dict.objects.create("my-dict", allow_existing=True)
            ```

            Note that this method does not return a local instance of the Dict. You can use
            `modal.Dict.from_name` to perform a lookup after creation.

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
            """Create a new Dict object.

            **Examples:**

            ```python notest
            modal.Dict.objects.create("my-dict")
            ```

            Dicts will be created in the active environment, or another one can be specified:

            ```python notest
            modal.Dict.objects.create("my-dict", environment_name="dev")
            ```

            By default, an error will be raised if the Dict already exists, but passing
            `allow_existing=True` will make the creation attempt a no-op in this case.

            ```python notest
            modal.Dict.objects.create("my-dict", allow_existing=True)
            ```

            Note that this method does not return a local instance of the Dict. You can use
            `modal.Dict.from_name` to perform a lookup after creation.

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
        ) -> list[Dict]:
            """Return a list of hydrated Dict objects.

            **Examples:**

            ```python
            dicts = modal.Dict.objects.list()
            print([d.name for d in dicts])
            ```

            Dicts will be retreived from the active environment, or another one can be specified:

            ```python notest
            dev_dicts = modal.Dict.objects.list(environment_name="dev")
            ```

            By default, all named Dict are returned, newest to oldest. It's also possible to limit the
            number of results and to filter by creation date:

            ```python
            dicts = modal.Dict.objects.list(max_objects=10, created_before="2025-01-01")
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
        ) -> list[Dict]:
            """Return a list of hydrated Dict objects.

            **Examples:**

            ```python
            dicts = modal.Dict.objects.list()
            print([d.name for d in dicts])
            ```

            Dicts will be retreived from the active environment, or another one can be specified:

            ```python notest
            dev_dicts = modal.Dict.objects.list(environment_name="dev")
            ```

            By default, all named Dict are returned, newest to oldest. It's also possible to limit the
            number of results and to filter by creation date:

            ```python
            dicts = modal.Dict.objects.list(max_objects=10, created_before="2025-01-01")
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
            """Delete a named Dict.

            Warning: This deletes an *entire Dict*, not just a specific key.
            Deletion is irreversible and will affect any Apps currently using the Dict.

            **Examples:**

            ```python notest
            await modal.Dict.objects.delete("my-dict")
            ```

            Dicts will be deleted from the active environment, or another one can be specified:

            ```python notest
            await modal.Dict.objects.delete("my-dict", environment_name="dev")
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
            """Delete a named Dict.

            Warning: This deletes an *entire Dict*, not just a specific key.
            Deletion is irreversible and will affect any Apps currently using the Dict.

            **Examples:**

            ```python notest
            await modal.Dict.objects.delete("my-dict")
            ```

            Dicts will be deleted from the active environment, or another one can be specified:

            ```python notest
            await modal.Dict.objects.delete("my-dict", environment_name="dev")
            ```

            Added in v1.1.2.
            """
            ...

    delete: typing.ClassVar[__delete_spec]

class _Dict(modal._object._Object):
    """Distributed dictionary for storage in Modal apps.

    Dict contents can be essentially any object so long as they can be serialized by
    `cloudpickle`. This includes other Modal objects. If writing and reading in different
    environments (eg., writing locally and reading remotely), it's necessary to have the
    library defining the data type installed, with compatible versions, on both sides.
    Additionally, cloudpickle serialization is not guaranteed to be deterministic, so it is
    generally recommended to use primitive types for keys.

    **Lifetime of a Dict and its items**

    An individual Dict entry will expire after 7 days of inactivity (no reads or writes). The
    Dict entries are written to durable storage.

    Legacy Dicts (created before 2025-05-20) will still have entries expire 30 days after being
    last added. Additionally, contents are stored in memory on the Modal server and could be lost
    due to unexpected server restarts. Eventually, these Dicts will be fully sunset.

    **Usage**

    ```python
    from modal import Dict

    my_dict = Dict.from_name("my-persisted_dict", create_if_missing=True)

    my_dict["some key"] = "some value"
    my_dict[123] = 456

    assert my_dict["some key"] == "some value"
    assert my_dict[123] == 456
    ```

    The `Dict` class offers a few methods for operations that are usually accomplished
    in Python with operators, such as `Dict.put` and `Dict.contains`. The advantage of
    these methods is that they can be safely called in an asynchronous context by using
    the `.aio` suffix on the method, whereas their operator-based analogues will always
    run synchronously and block the event loop.

    For more examples, see the [guide](https://modal.com/docs/guide/dicts-and-queues#modal-dicts).
    """

    _name: typing.Optional[str]
    _metadata: typing.Optional[modal_proto.api_pb2.DictMetadata]

    def __init__(self, data={}):
        """mdmd:hidden"""
        ...

    @synchronicity.classproperty
    def objects(cls) -> _DictManager: ...
    @property
    def name(self) -> typing.Optional[str]: ...
    def _hydrate_metadata(self, metadata: typing.Optional[google.protobuf.message.Message]): ...
    def _get_metadata(self) -> modal_proto.api_pb2.DictMetadata: ...
    @classmethod
    def ephemeral(
        cls: type[_Dict],
        data: typing.Optional[dict] = None,
        client: typing.Optional[modal.client._Client] = None,
        environment_name: typing.Optional[str] = None,
        _heartbeat_sleep: float = 300,
    ) -> typing.AsyncContextManager[_Dict]:
        """Creates a new ephemeral Dict within a context manager:

        Usage:
        ```python
        from modal import Dict

        with Dict.ephemeral() as d:
            d["foo"] = "bar"
        ```

        ```python notest
        async with Dict.ephemeral() as d:
            await d.put.aio("foo", "bar")
        ```
        """
        ...

    @staticmethod
    def from_name(
        name: str,
        data: typing.Optional[dict] = None,
        *,
        namespace=None,
        environment_name: typing.Optional[str] = None,
        create_if_missing: bool = False,
        client: typing.Optional[modal.client._Client] = None,
    ) -> _Dict:
        """Reference a named Dict, creating if necessary.

        This is a lazy method that defers hydrating the local
        object with metadata from Modal servers until the first
        time it is actually used.

        ```python
        d = modal.Dict.from_name("my-dict", create_if_missing=True)
        d[123] = 456
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
        Delete a named Dict object.

        Warning: This deletes an *entire Dict*, not just a specific key.
        Deletion is irreversible and will affect any Apps currently using the Dict.

        DEPRECATED: This method is deprecated; we recommend using `modal.Dict.objects.delete` instead.
        """
        ...

    async def info(self) -> DictInfo:
        """Return information about the Dict object."""
        ...

    async def clear(self) -> None:
        """Remove all items from the Dict."""
        ...

    async def get(self, key: typing.Any, default: typing.Optional[typing.Any] = None) -> typing.Any:
        """Get the value associated with a key.

        Returns `default` if key does not exist.
        """
        ...

    async def contains(self, key: typing.Any) -> bool:
        """Return if a key is present."""
        ...

    async def len(self) -> int:
        """Return the length of the Dict.

        Note: This is an expensive operation and will return at most 100,000.
        """
        ...

    async def __getitem__(self, key: typing.Any) -> typing.Any:
        """Get the value associated with a key.

        Note: this function will block the event loop when called in an async context.
        """
        ...

    async def update(self, other: typing.Optional[collections.abc.Mapping] = None, /, **kwargs) -> None:
        """Update the Dict with additional items."""
        ...

    async def put(self, key: typing.Any, value: typing.Any, *, skip_if_exists: bool = False) -> bool:
        """Add a specific key-value pair to the Dict.

        Returns True if the key-value pair was added and False if it wasn't because the key already existed and
        `skip_if_exists` was set.
        """
        ...

    async def __setitem__(self, key: typing.Any, value: typing.Any) -> None:
        """Set a specific key-value pair to the Dict.

        Note: this function will block the event loop when called in an async context.
        """
        ...

    async def pop(self, key: typing.Any, default: typing.Any = ...) -> typing.Any:
        """Remove a key from the Dict, returning the value if it exists.

        If key is not found, return default if provided, otherwise raise KeyError.
        """
        ...

    async def __delitem__(self, key: typing.Any) -> typing.Any:
        """Delete a key from the Dict.

        Note: this function will block the event loop when called in an async context.
        """
        ...

    async def __contains__(self, key: typing.Any) -> bool:
        """Return if a key is present.

        Note: this function will block the event loop when called in an async context.
        """
        ...

    def keys(self) -> collections.abc.AsyncIterator[typing.Any]:
        """Return an iterator over the keys in this Dict.

        Note that (unlike with Python dicts) the return value is a simple iterator,
        and results are unordered.
        """
        ...

    def values(self) -> collections.abc.AsyncIterator[typing.Any]:
        """Return an iterator over the values in this Dict.

        Note that (unlike with Python dicts) the return value is a simple iterator,
        and results are unordered.
        """
        ...

    def items(self) -> collections.abc.AsyncIterator[tuple[typing.Any, typing.Any]]:
        """Return an iterator over the (key, value) tuples in this Dict.

        Note that (unlike with Python dicts) the return value is a simple iterator,
        and results are unordered.
        """
        ...

class Dict(modal.object.Object):
    """Distributed dictionary for storage in Modal apps.

    Dict contents can be essentially any object so long as they can be serialized by
    `cloudpickle`. This includes other Modal objects. If writing and reading in different
    environments (eg., writing locally and reading remotely), it's necessary to have the
    library defining the data type installed, with compatible versions, on both sides.
    Additionally, cloudpickle serialization is not guaranteed to be deterministic, so it is
    generally recommended to use primitive types for keys.

    **Lifetime of a Dict and its items**

    An individual Dict entry will expire after 7 days of inactivity (no reads or writes). The
    Dict entries are written to durable storage.

    Legacy Dicts (created before 2025-05-20) will still have entries expire 30 days after being
    last added. Additionally, contents are stored in memory on the Modal server and could be lost
    due to unexpected server restarts. Eventually, these Dicts will be fully sunset.

    **Usage**

    ```python
    from modal import Dict

    my_dict = Dict.from_name("my-persisted_dict", create_if_missing=True)

    my_dict["some key"] = "some value"
    my_dict[123] = 456

    assert my_dict["some key"] == "some value"
    assert my_dict[123] == 456
    ```

    The `Dict` class offers a few methods for operations that are usually accomplished
    in Python with operators, such as `Dict.put` and `Dict.contains`. The advantage of
    these methods is that they can be safely called in an asynchronous context by using
    the `.aio` suffix on the method, whereas their operator-based analogues will always
    run synchronously and block the event loop.

    For more examples, see the [guide](https://modal.com/docs/guide/dicts-and-queues#modal-dicts).
    """

    _name: typing.Optional[str]
    _metadata: typing.Optional[modal_proto.api_pb2.DictMetadata]

    def __init__(self, data={}):
        """mdmd:hidden"""
        ...

    @synchronicity.classproperty
    def objects(cls) -> DictManager: ...
    @property
    def name(self) -> typing.Optional[str]: ...
    def _hydrate_metadata(self, metadata: typing.Optional[google.protobuf.message.Message]): ...
    def _get_metadata(self) -> modal_proto.api_pb2.DictMetadata: ...

    class __ephemeral_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            data: typing.Optional[dict] = None,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
            _heartbeat_sleep: float = 300,
        ) -> synchronicity.combined_types.AsyncAndBlockingContextManager[Dict]:
            """Creates a new ephemeral Dict within a context manager:

            Usage:
            ```python
            from modal import Dict

            with Dict.ephemeral() as d:
                d["foo"] = "bar"
            ```

            ```python notest
            async with Dict.ephemeral() as d:
                await d.put.aio("foo", "bar")
            ```
            """
            ...

        def aio(
            self,
            /,
            data: typing.Optional[dict] = None,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
            _heartbeat_sleep: float = 300,
        ) -> typing.AsyncContextManager[Dict]:
            """Creates a new ephemeral Dict within a context manager:

            Usage:
            ```python
            from modal import Dict

            with Dict.ephemeral() as d:
                d["foo"] = "bar"
            ```

            ```python notest
            async with Dict.ephemeral() as d:
                await d.put.aio("foo", "bar")
            ```
            """
            ...

    ephemeral: typing.ClassVar[__ephemeral_spec]

    @staticmethod
    def from_name(
        name: str,
        data: typing.Optional[dict] = None,
        *,
        namespace=None,
        environment_name: typing.Optional[str] = None,
        create_if_missing: bool = False,
        client: typing.Optional[modal.client.Client] = None,
    ) -> Dict:
        """Reference a named Dict, creating if necessary.

        This is a lazy method that defers hydrating the local
        object with metadata from Modal servers until the first
        time it is actually used.

        ```python
        d = modal.Dict.from_name("my-dict", create_if_missing=True)
        d[123] = 456
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
            Delete a named Dict object.

            Warning: This deletes an *entire Dict*, not just a specific key.
            Deletion is irreversible and will affect any Apps currently using the Dict.

            DEPRECATED: This method is deprecated; we recommend using `modal.Dict.objects.delete` instead.
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
            Delete a named Dict object.

            Warning: This deletes an *entire Dict*, not just a specific key.
            Deletion is irreversible and will affect any Apps currently using the Dict.

            DEPRECATED: This method is deprecated; we recommend using `modal.Dict.objects.delete` instead.
            """
            ...

    delete: typing.ClassVar[__delete_spec]

    class __info_spec(typing_extensions.Protocol):
        def __call__(self, /) -> DictInfo:
            """Return information about the Dict object."""
            ...

        async def aio(self, /) -> DictInfo:
            """Return information about the Dict object."""
            ...

    info: __info_spec

    class __clear_spec(typing_extensions.Protocol):
        def __call__(self, /) -> None:
            """Remove all items from the Dict."""
            ...

        async def aio(self, /) -> None:
            """Remove all items from the Dict."""
            ...

    clear: __clear_spec

    class __get_spec(typing_extensions.Protocol):
        def __call__(self, /, key: typing.Any, default: typing.Optional[typing.Any] = None) -> typing.Any:
            """Get the value associated with a key.

            Returns `default` if key does not exist.
            """
            ...

        async def aio(self, /, key: typing.Any, default: typing.Optional[typing.Any] = None) -> typing.Any:
            """Get the value associated with a key.

            Returns `default` if key does not exist.
            """
            ...

    get: __get_spec

    class __contains_spec(typing_extensions.Protocol):
        def __call__(self, /, key: typing.Any) -> bool:
            """Return if a key is present."""
            ...

        async def aio(self, /, key: typing.Any) -> bool:
            """Return if a key is present."""
            ...

    contains: __contains_spec

    class __len_spec(typing_extensions.Protocol):
        def __call__(self, /) -> int:
            """Return the length of the Dict.

            Note: This is an expensive operation and will return at most 100,000.
            """
            ...

        async def aio(self, /) -> int:
            """Return the length of the Dict.

            Note: This is an expensive operation and will return at most 100,000.
            """
            ...

    len: __len_spec

    class ____getitem___spec(typing_extensions.Protocol):
        def __call__(self, /, key: typing.Any) -> typing.Any:
            """Get the value associated with a key.

            Note: this function will block the event loop when called in an async context.
            """
            ...

        async def aio(self, /, key: typing.Any) -> typing.Any:
            """Get the value associated with a key.

            Note: this function will block the event loop when called in an async context.
            """
            ...

    __getitem__: ____getitem___spec

    class __update_spec(typing_extensions.Protocol):
        def __call__(self, other: typing.Optional[collections.abc.Mapping] = None, /, **kwargs) -> None:
            """Update the Dict with additional items."""
            ...

        async def aio(self, other: typing.Optional[collections.abc.Mapping] = None, /, **kwargs) -> None:
            """Update the Dict with additional items."""
            ...

    update: __update_spec

    class __put_spec(typing_extensions.Protocol):
        def __call__(self, /, key: typing.Any, value: typing.Any, *, skip_if_exists: bool = False) -> bool:
            """Add a specific key-value pair to the Dict.

            Returns True if the key-value pair was added and False if it wasn't because the key already existed and
            `skip_if_exists` was set.
            """
            ...

        async def aio(self, /, key: typing.Any, value: typing.Any, *, skip_if_exists: bool = False) -> bool:
            """Add a specific key-value pair to the Dict.

            Returns True if the key-value pair was added and False if it wasn't because the key already existed and
            `skip_if_exists` was set.
            """
            ...

    put: __put_spec

    class ____setitem___spec(typing_extensions.Protocol):
        def __call__(self, /, key: typing.Any, value: typing.Any) -> None:
            """Set a specific key-value pair to the Dict.

            Note: this function will block the event loop when called in an async context.
            """
            ...

        async def aio(self, /, key: typing.Any, value: typing.Any) -> None:
            """Set a specific key-value pair to the Dict.

            Note: this function will block the event loop when called in an async context.
            """
            ...

    __setitem__: ____setitem___spec

    class __pop_spec(typing_extensions.Protocol):
        def __call__(self, /, key: typing.Any, default: typing.Any = ...) -> typing.Any:
            """Remove a key from the Dict, returning the value if it exists.

            If key is not found, return default if provided, otherwise raise KeyError.
            """
            ...

        async def aio(self, /, key: typing.Any, default: typing.Any = ...) -> typing.Any:
            """Remove a key from the Dict, returning the value if it exists.

            If key is not found, return default if provided, otherwise raise KeyError.
            """
            ...

    pop: __pop_spec

    class ____delitem___spec(typing_extensions.Protocol):
        def __call__(self, /, key: typing.Any) -> typing.Any:
            """Delete a key from the Dict.

            Note: this function will block the event loop when called in an async context.
            """
            ...

        async def aio(self, /, key: typing.Any) -> typing.Any:
            """Delete a key from the Dict.

            Note: this function will block the event loop when called in an async context.
            """
            ...

    __delitem__: ____delitem___spec

    class ____contains___spec(typing_extensions.Protocol):
        def __call__(self, /, key: typing.Any) -> bool:
            """Return if a key is present.

            Note: this function will block the event loop when called in an async context.
            """
            ...

        async def aio(self, /, key: typing.Any) -> bool:
            """Return if a key is present.

            Note: this function will block the event loop when called in an async context.
            """
            ...

    __contains__: ____contains___spec

    class __keys_spec(typing_extensions.Protocol):
        def __call__(self, /) -> typing.Iterator[typing.Any]:
            """Return an iterator over the keys in this Dict.

            Note that (unlike with Python dicts) the return value is a simple iterator,
            and results are unordered.
            """
            ...

        def aio(self, /) -> collections.abc.AsyncIterator[typing.Any]:
            """Return an iterator over the keys in this Dict.

            Note that (unlike with Python dicts) the return value is a simple iterator,
            and results are unordered.
            """
            ...

    keys: __keys_spec

    class __values_spec(typing_extensions.Protocol):
        def __call__(self, /) -> typing.Iterator[typing.Any]:
            """Return an iterator over the values in this Dict.

            Note that (unlike with Python dicts) the return value is a simple iterator,
            and results are unordered.
            """
            ...

        def aio(self, /) -> collections.abc.AsyncIterator[typing.Any]:
            """Return an iterator over the values in this Dict.

            Note that (unlike with Python dicts) the return value is a simple iterator,
            and results are unordered.
            """
            ...

    values: __values_spec

    class __items_spec(typing_extensions.Protocol):
        def __call__(self, /) -> typing.Iterator[tuple[typing.Any, typing.Any]]:
            """Return an iterator over the (key, value) tuples in this Dict.

            Note that (unlike with Python dicts) the return value is a simple iterator,
            and results are unordered.
            """
            ...

        def aio(self, /) -> collections.abc.AsyncIterator[tuple[typing.Any, typing.Any]]:
            """Return an iterator over the (key, value) tuples in this Dict.

            Note that (unlike with Python dicts) the return value is a simple iterator,
            and results are unordered.
            """
            ...

    items: __items_spec
