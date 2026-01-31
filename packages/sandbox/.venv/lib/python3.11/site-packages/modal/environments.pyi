import google.protobuf.message
import modal._object
import modal.client
import modal.object
import modal_proto.api_pb2
import typing
import typing_extensions

class EnvironmentSettings:
    """EnvironmentSettings(image_builder_version: str, webhook_suffix: str)"""

    image_builder_version: str
    webhook_suffix: str

    def __init__(self, image_builder_version: str, webhook_suffix: str) -> None:
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    def __repr__(self):
        """Return repr(self)."""
        ...

    def __eq__(self, other):
        """Return self==value."""
        ...

    def __setattr__(self, name, value):
        """Implement setattr(self, name, value)."""
        ...

    def __delattr__(self, name):
        """Implement delattr(self, name)."""
        ...

    def __hash__(self):
        """Return hash(self)."""
        ...

class _Environment(modal._object._Object):
    _settings: EnvironmentSettings

    def __init__(self):
        """mdmd:hidden"""
        ...

    def _hydrate_metadata(self, metadata: google.protobuf.message.Message): ...
    @staticmethod
    def from_name(
        name: str, *, create_if_missing: bool = False, client: typing.Optional[modal.client._Client] = None
    ): ...

class Environment(modal.object.Object):
    _settings: EnvironmentSettings

    def __init__(self):
        """mdmd:hidden"""
        ...

    def _hydrate_metadata(self, metadata: google.protobuf.message.Message): ...
    @staticmethod
    def from_name(
        name: str, *, create_if_missing: bool = False, client: typing.Optional[modal.client.Client] = None
    ): ...

async def _get_environment_cached(name: str, client: modal.client._Client) -> _Environment: ...

class __delete_environment_spec(typing_extensions.Protocol):
    def __call__(self, /, name: str, client: typing.Optional[modal.client.Client] = None): ...
    async def aio(self, /, name: str, client: typing.Optional[modal.client.Client] = None): ...

delete_environment: __delete_environment_spec

class __update_environment_spec(typing_extensions.Protocol):
    def __call__(
        self,
        /,
        current_name: str,
        *,
        new_name: typing.Optional[str] = None,
        new_web_suffix: typing.Optional[str] = None,
        client: typing.Optional[modal.client.Client] = None,
    ): ...
    async def aio(
        self,
        /,
        current_name: str,
        *,
        new_name: typing.Optional[str] = None,
        new_web_suffix: typing.Optional[str] = None,
        client: typing.Optional[modal.client.Client] = None,
    ): ...

update_environment: __update_environment_spec

class __create_environment_spec(typing_extensions.Protocol):
    def __call__(self, /, name: str, client: typing.Optional[modal.client.Client] = None): ...
    async def aio(self, /, name: str, client: typing.Optional[modal.client.Client] = None): ...

create_environment: __create_environment_spec

class __list_environments_spec(typing_extensions.Protocol):
    def __call__(
        self, /, client: typing.Optional[modal.client.Client] = None
    ) -> list[modal_proto.api_pb2.EnvironmentListItem]: ...
    async def aio(
        self, /, client: typing.Optional[modal.client.Client] = None
    ) -> list[modal_proto.api_pb2.EnvironmentListItem]: ...

list_environments: __list_environments_spec

def ensure_env(environment_name: typing.Optional[str] = None) -> str:
    """Override config environment with environment from environment_name

    This is necessary since a cli command that runs Modal code, without explicit
    environment specification wouldn't pick up the environment specified in a
    command line flag otherwise, e.g. when doing `modal run --env=foo`
    """
    ...

ENVIRONMENT_CACHE: dict[str, _Environment]
