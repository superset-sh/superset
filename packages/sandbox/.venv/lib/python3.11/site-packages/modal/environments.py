# Copyright Modal Labs 2023
from dataclasses import dataclass
from typing import Optional

from google.protobuf.empty_pb2 import Empty
from google.protobuf.message import Message
from google.protobuf.wrappers_pb2 import StringValue

from modal_proto import api_pb2

from ._load_context import LoadContext
from ._object import _Object
from ._resolver import Resolver
from ._utils.async_utils import synchronize_api, synchronizer
from ._utils.name_utils import check_object_name
from .client import _Client
from .config import config, logger


@dataclass(frozen=True)
class EnvironmentSettings:
    image_builder_version: str  # Ideally would be typed with ImageBuilderVersion literal
    webhook_suffix: str


class _Environment(_Object, type_prefix="en"):
    _settings: EnvironmentSettings

    def __init__(self):
        """mdmd:hidden"""
        raise RuntimeError("`Environment(...)` constructor is not allowed. Please use `Environment.from_name` instead.")

    # TODO(michael) Keeping this private for now until we decide what else should be in it
    # And what the rules should be about updates / mutability
    # @property
    # def settings(self) -> EnvironmentSettings:
    #     return self._settings

    def _hydrate_metadata(self, metadata: Message):
        # Overridden concrete implementation of base class method
        assert metadata and isinstance(metadata, api_pb2.EnvironmentMetadata)
        # TODO(michael) should probably expose the `name` from the metadata
        # as the way to discover the name of the "default" environment

        # Is there a simpler way to go Message -> Dataclass?
        self._settings = EnvironmentSettings(
            image_builder_version=metadata.settings.image_builder_version,
            webhook_suffix=metadata.settings.webhook_suffix,
        )

    @staticmethod
    def from_name(
        name: str,
        *,
        create_if_missing: bool = False,
        client: Optional[_Client] = None,
    ):
        if name:
            # Allow null names for the case where we want to look up the "default" environment,
            # which is defined by the server. It feels messy to have "from_name" without a name, though?
            # We're adding this mostly for internal use right now. We could consider an environment-only
            # alternate constructor, like `Environment.get_default`, rather than exposing "unnamed"
            # environments as part of public API when we make this class more useful.
            check_object_name(name, "Environment")

        async def _load(
            self: _Environment, resolver: Resolver, load_context: LoadContext, existing_object_id: Optional[str]
        ):
            request = api_pb2.EnvironmentGetOrCreateRequest(
                deployment_name=name,
                object_creation_type=(
                    api_pb2.OBJECT_CREATION_TYPE_CREATE_IF_MISSING
                    if create_if_missing
                    else api_pb2.OBJECT_CREATION_TYPE_UNSPECIFIED
                ),
            )
            response = await load_context.client.stub.EnvironmentGetOrCreate(request)
            logger.debug(f"Created environment with id {response.environment_id}")
            self._hydrate(response.environment_id, load_context.client, response.metadata)

        return _Environment._from_loader(
            _load,
            f"Environment.from_name({name!r})",
            is_another_app=True,
            hydrate_lazily=True,
            load_context_overrides=LoadContext(client=client),
        )


Environment = synchronize_api(_Environment)


# Needs to be after definition; synchronicity interferes with forward references?
ENVIRONMENT_CACHE: dict[str, _Environment] = {}


async def _get_environment_cached(name: str, client: _Client) -> _Environment:
    if name in ENVIRONMENT_CACHE:
        return ENVIRONMENT_CACHE[name]
    environment = await _Environment.from_name(name, client=client).hydrate()
    ENVIRONMENT_CACHE[name] = environment
    return environment


@synchronizer.create_blocking
async def delete_environment(name: str, client: Optional[_Client] = None):
    if client is None:
        client = await _Client.from_env()
    await client.stub.EnvironmentDelete(api_pb2.EnvironmentDeleteRequest(name=name))


@synchronizer.create_blocking
async def update_environment(
    current_name: str,
    *,
    new_name: Optional[str] = None,
    new_web_suffix: Optional[str] = None,
    client: Optional[_Client] = None,
):
    new_name_pb2 = None
    new_web_suffix_pb2 = None
    if new_name is not None:
        if len(new_name) < 1:
            raise ValueError("The new environment name cannot be empty")

        new_name_pb2 = StringValue(value=new_name)

    if new_web_suffix is not None:
        new_web_suffix_pb2 = StringValue(value=new_web_suffix)

    update_payload = api_pb2.EnvironmentUpdateRequest(
        current_name=current_name, name=new_name_pb2, web_suffix=new_web_suffix_pb2
    )
    if client is None:
        client = await _Client.from_env()
    await client.stub.EnvironmentUpdate(update_payload)


@synchronizer.create_blocking
async def create_environment(name: str, client: Optional[_Client] = None):
    if client is None:
        client = await _Client.from_env()
    await client.stub.EnvironmentCreate(api_pb2.EnvironmentCreateRequest(name=name))


@synchronizer.create_blocking
async def list_environments(client: Optional[_Client] = None) -> list[api_pb2.EnvironmentListItem]:
    if client is None:
        client = await _Client.from_env()
    resp = await client.stub.EnvironmentList(Empty())
    return list(resp.items)


def ensure_env(environment_name: Optional[str] = None) -> str:
    """Override config environment with environment from environment_name

    This is necessary since a cli command that runs Modal code, without explicit
    environment specification wouldn't pick up the environment specified in a
    command line flag otherwise, e.g. when doing `modal run --env=foo`
    """
    if environment_name is not None:
        config.override_locally("environment", environment_name)

    return config.get("environment")
