import collections.abc
import google.protobuf.message
import modal._load_context
import modal._resolver
import modal.client
import typing
import typing_extensions

SUPERSELF = typing.TypeVar("SUPERSELF", covariant=True)

class Object:
    _type_prefix: typing.ClassVar[typing.Optional[str]]
    _prefix_to_type: typing.ClassVar[dict[str, type]]
    _load: typing.Optional[
        collections.abc.Callable[
            [typing_extensions.Self, modal._resolver.Resolver, modal._load_context.LoadContext, typing.Optional[str]],
            collections.abc.Awaitable[None],
        ]
    ]
    _preload: typing.Optional[
        collections.abc.Callable[
            [typing_extensions.Self, modal._resolver.Resolver, modal._load_context.LoadContext, typing.Optional[str]],
            collections.abc.Awaitable[None],
        ]
    ]
    _rep: str
    _is_another_app: bool
    _hydrate_lazily: bool
    _deps: typing.Optional[collections.abc.Callable[..., collections.abc.Sequence[Object]]]
    _deduplication_key: typing.Optional[
        collections.abc.Callable[[], collections.abc.Awaitable[collections.abc.Hashable]]
    ]
    _load_context_overrides: modal._load_context.LoadContext
    _object_id: typing.Optional[str]
    _client: typing.Optional[modal.client.Client]
    _is_hydrated: bool
    _is_rehydrated: bool
    _name: typing.Optional[str]

    def __init__(self, *args, **kwargs):
        """mdmd:hidden"""
        ...

    @classmethod
    def __init_subclass__(cls, type_prefix: typing.Optional[str] = None): ...

    class ___init_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            rep: str,
            load: typing.Optional[
                collections.abc.Callable[
                    [
                        typing_extensions.Self,
                        modal._resolver.Resolver,
                        modal._load_context.LoadContext,
                        typing.Optional[str],
                    ],
                    None,
                ]
            ] = None,
            is_another_app: bool = False,
            preload: typing.Optional[
                collections.abc.Callable[
                    [
                        typing_extensions.Self,
                        modal._resolver.Resolver,
                        modal._load_context.LoadContext,
                        typing.Optional[str],
                    ],
                    None,
                ]
            ] = None,
            hydrate_lazily: bool = False,
            deps: typing.Optional[collections.abc.Callable[..., collections.abc.Sequence[Object]]] = None,
            deduplication_key: typing.Optional[collections.abc.Callable[[], collections.abc.Hashable]] = None,
            name: typing.Optional[str] = None,
            *,
            load_context_overrides: typing.Optional[modal._load_context.LoadContext] = None,
        ): ...
        def aio(
            self,
            /,
            rep: str,
            load: typing.Optional[
                collections.abc.Callable[
                    [
                        typing_extensions.Self,
                        modal._resolver.Resolver,
                        modal._load_context.LoadContext,
                        typing.Optional[str],
                    ],
                    collections.abc.Awaitable[None],
                ]
            ] = None,
            is_another_app: bool = False,
            preload: typing.Optional[
                collections.abc.Callable[
                    [
                        typing_extensions.Self,
                        modal._resolver.Resolver,
                        modal._load_context.LoadContext,
                        typing.Optional[str],
                    ],
                    collections.abc.Awaitable[None],
                ]
            ] = None,
            hydrate_lazily: bool = False,
            deps: typing.Optional[collections.abc.Callable[..., collections.abc.Sequence[Object]]] = None,
            deduplication_key: typing.Optional[
                collections.abc.Callable[[], collections.abc.Awaitable[collections.abc.Hashable]]
            ] = None,
            name: typing.Optional[str] = None,
            *,
            load_context_overrides: typing.Optional[modal._load_context.LoadContext] = None,
        ): ...

    _init: ___init_spec

    def _unhydrate(self): ...
    def _initialize_from_empty(self): ...
    def _initialize_from_other(self, other): ...
    def _hydrate(
        self, object_id: str, client: modal.client.Client, metadata: typing.Optional[google.protobuf.message.Message]
    ): ...
    def _hydrate_metadata(self, metadata: typing.Optional[google.protobuf.message.Message]): ...
    def _get_metadata(self) -> typing.Optional[google.protobuf.message.Message]: ...
    def _validate_is_hydrated(self): ...
    def clone(self) -> typing_extensions.Self:
        """mdmd:hidden Clone a given hydrated object.

        Note: This is not intended to be public API and has no public use. It will be removed in a future release.
        """
        ...

    class ___from_loader_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            load: collections.abc.Callable[
                [
                    typing_extensions.Self,
                    modal._resolver.Resolver,
                    modal._load_context.LoadContext,
                    typing.Optional[str],
                ],
                None,
            ],
            rep: str,
            is_another_app: bool = False,
            preload: typing.Optional[
                collections.abc.Callable[
                    [
                        typing_extensions.Self,
                        modal._resolver.Resolver,
                        modal._load_context.LoadContext,
                        typing.Optional[str],
                    ],
                    None,
                ]
            ] = None,
            hydrate_lazily: bool = False,
            deps: typing.Optional[collections.abc.Callable[..., collections.abc.Sequence[Object]]] = None,
            deduplication_key: typing.Optional[collections.abc.Callable[[], collections.abc.Hashable]] = None,
            name: typing.Optional[str] = None,
            *,
            load_context_overrides: modal._load_context.LoadContext,
        ): ...
        def aio(
            self,
            /,
            load: collections.abc.Callable[
                [
                    typing_extensions.Self,
                    modal._resolver.Resolver,
                    modal._load_context.LoadContext,
                    typing.Optional[str],
                ],
                collections.abc.Awaitable[None],
            ],
            rep: str,
            is_another_app: bool = False,
            preload: typing.Optional[
                collections.abc.Callable[
                    [
                        typing_extensions.Self,
                        modal._resolver.Resolver,
                        modal._load_context.LoadContext,
                        typing.Optional[str],
                    ],
                    collections.abc.Awaitable[None],
                ]
            ] = None,
            hydrate_lazily: bool = False,
            deps: typing.Optional[collections.abc.Callable[..., collections.abc.Sequence[Object]]] = None,
            deduplication_key: typing.Optional[
                collections.abc.Callable[[], collections.abc.Awaitable[collections.abc.Hashable]]
            ] = None,
            name: typing.Optional[str] = None,
            *,
            load_context_overrides: modal._load_context.LoadContext,
        ): ...

    _from_loader: typing.ClassVar[___from_loader_spec]

    @staticmethod
    def _get_type_from_id(object_id: str) -> type[Object]: ...
    @classmethod
    def _is_id_type(cls, object_id) -> bool: ...
    @classmethod
    def _repr(cls, name: str, environment_name: typing.Optional[str] = None) -> str: ...
    @classmethod
    def _new_hydrated(
        cls,
        object_id: str,
        client: modal.client.Client,
        handle_metadata: typing.Optional[google.protobuf.message.Message],
        is_another_app: bool = False,
        rep: typing.Optional[str] = None,
    ) -> typing_extensions.Self: ...
    def _hydrate_from_other(self, other: typing_extensions.Self): ...
    def __repr__(self): ...
    @property
    def local_uuid(self):
        """mdmd:hidden"""
        ...

    @property
    def object_id(self) -> str:
        """mdmd:hidden"""
        ...

    class __get_dashboard_url_spec(typing_extensions.Protocol):
        def __call__(self, /) -> str:
            """mdmd:hidden"""
            ...

        async def aio(self, /) -> str:
            """mdmd:hidden"""
            ...

    get_dashboard_url: __get_dashboard_url_spec

    @property
    def client(self) -> modal.client.Client:
        """mdmd:hidden"""
        ...

    @property
    def is_hydrated(self) -> bool:
        """mdmd:hidden"""
        ...

    @property
    def deps(self) -> collections.abc.Callable[..., collections.abc.Sequence[Object]]:
        """mdmd:hidden"""
        ...

    class __hydrate_spec(typing_extensions.Protocol[SUPERSELF]):
        def __call__(self, /, client: typing.Optional[modal.client.Client] = None) -> SUPERSELF:
            """Synchronize the local object with its identity on the Modal server.

            It is rarely necessary to call this method explicitly, as most operations
            will lazily hydrate when needed. The main use case is when you need to
            access object metadata, such as its ID.

            *Added in v0.72.39*: This method replaces the deprecated `.resolve()` method.
            """
            ...

        async def aio(self, /, client: typing.Optional[modal.client.Client] = None) -> SUPERSELF:
            """Synchronize the local object with its identity on the Modal server.

            It is rarely necessary to call this method explicitly, as most operations
            will lazily hydrate when needed. The main use case is when you need to
            access object metadata, such as its ID.

            *Added in v0.72.39*: This method replaces the deprecated `.resolve()` method.
            """
            ...

    hydrate: __hydrate_spec[typing_extensions.Self]
