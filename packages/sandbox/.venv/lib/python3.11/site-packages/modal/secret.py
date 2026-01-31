# Copyright Modal Labs 2022
import builtins
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Union

from google.protobuf.message import Message
from synchronicity import classproperty

from modal_proto import api_pb2

from ._load_context import LoadContext
from ._object import _get_environment_name, _Object, live_method
from ._resolver import Resolver
from ._runtime.execution_context import is_local
from ._utils.async_utils import synchronize_api
from ._utils.deprecation import deprecation_warning, warn_if_passing_namespace
from ._utils.name_utils import check_object_name
from ._utils.time_utils import as_timestamp, timestamp_to_localized_dt
from .client import _Client
from .exception import AlreadyExistsError, InvalidError, NotFoundError

ENV_DICT_WRONG_TYPE_ERR = "the env_dict argument to Secret has to be a dict[str, Union[str, None]]"


@dataclass
class SecretInfo:
    """Information about the Secret object."""

    # This dataclass should be limited to information that is unchanging over the lifetime of the Secret,
    # since it is transmitted from the server when the object is hydrated and could be stale when accessed.

    name: Optional[str]
    created_at: datetime
    created_by: Optional[str]


class _SecretManager:
    """Namespace with methods for managing named Secret objects."""

    @staticmethod
    async def create(
        name: str,  # Name to use for the new Secret
        env_dict: dict[str, str],  # Key-value pairs to set in the Secret
        *,
        allow_existing: bool = False,  # If True, no-op when the Secret already exists
        environment_name: Optional[str] = None,  # Uses active environment if not specified
        client: Optional[_Client] = None,  # Optional client with Modal credentials
    ) -> None:
        """Create a new Secret object.

        **Examples:**

        ```python notest
        contents = {"MY_KEY": "my-value", "MY_OTHER_KEY": "my-other-value"}
        modal.Secret.objects.create("my-secret", contents)
        ```

        Secrets will be created in the active environment, or another one can be specified:

        ```python notest
        modal.Secret.objects.create("my-secret", contents, environment_name="dev")
        ```

        By default, an error will be raised if the Secret already exists, but passing
        `allow_existing=True` will make the creation attempt a no-op in this case.
        If the `env_dict` data differs from the existing Secret, it will be ignored.

        ```python notest
        modal.Secret.objects.create("my-secret", contents, allow_existing=True)
        ```

        Note that this method does not return a local instance of the Secret. You can use
        `modal.Secret.from_name` to perform a lookup after creation.

        Added in v1.1.2.

        """
        check_object_name(name, "Secret")
        client = await _Client.from_env() if client is None else client
        object_creation_type = (
            api_pb2.OBJECT_CREATION_TYPE_CREATE_IF_MISSING
            if allow_existing
            else api_pb2.OBJECT_CREATION_TYPE_CREATE_FAIL_IF_EXISTS
        )
        req = api_pb2.SecretGetOrCreateRequest(
            deployment_name=name,
            environment_name=_get_environment_name(environment_name),
            object_creation_type=object_creation_type,
            env_dict=env_dict,
        )
        try:
            await client.stub.SecretGetOrCreate(req)
        except AlreadyExistsError:
            if not allow_existing:
                raise

    @staticmethod
    async def list(
        *,
        max_objects: Optional[int] = None,  # Limit requests to this size
        created_before: Optional[Union[datetime, str]] = None,  # Limit based on creation date
        environment_name: str = "",  # Uses active environment if not specified
        client: Optional[_Client] = None,  # Optional client with Modal credentials
    ) -> builtins.list["_Secret"]:
        """Return a list of hydrated Secret objects.

        **Examples:**

        ```python
        secrets = modal.Secret.objects.list()
        print([s.name for s in secrets])
        ```

        Secrets will be retreived from the active environment, or another one can be specified:

        ```python notest
        dev_secrets = modal.Secret.objects.list(environment_name="dev")
        ```

        By default, all named Secrets are returned, newest to oldest. It's also possible to limit the
        number of results and to filter by creation date:

        ```python
        secrets = modal.Secret.objects.list(max_objects=10, created_before="2025-01-01")
        ```

        Added in v1.1.2.

        """
        client = await _Client.from_env() if client is None else client
        if max_objects is not None and max_objects < 0:
            raise InvalidError("max_objects cannot be negative")

        items: list[api_pb2.SecretListItem] = []

        async def retrieve_page(created_before: float) -> bool:
            max_page_size = 100 if max_objects is None else min(100, max_objects - len(items))
            pagination = api_pb2.ListPagination(max_objects=max_page_size, created_before=created_before)
            req = api_pb2.SecretListRequest(
                environment_name=_get_environment_name(environment_name), pagination=pagination
            )
            resp = await client.stub.SecretList(req)
            items.extend(resp.items)
            finished = (len(resp.items) < max_page_size) or (max_objects is not None and len(items) >= max_objects)
            return finished

        finished = await retrieve_page(as_timestamp(created_before))
        while True:
            if finished:
                break
            finished = await retrieve_page(items[-1].metadata.creation_info.created_at)

        secrets = [
            _Secret._new_hydrated(
                item.secret_id,
                client,
                item.metadata,
                is_another_app=True,
                rep=_Secret._repr(item.label, environment_name),
            )
            for item in items
        ]
        return secrets[:max_objects] if max_objects is not None else secrets

    @staticmethod
    async def delete(
        name: str,  # Name of the Secret to delete
        *,
        allow_missing: bool = False,  # If True, don't raise an error if the Secret doesn't exist
        environment_name: Optional[str] = None,  # Uses active environment if not specified
        client: Optional[_Client] = None,  # Optional client with Modal credentials
    ):
        """Delete a named Secret.

        Warning: Deletion is irreversible and will affect any Apps currently using the Secret.

        **Examples:**

        ```python notest
        await modal.Secret.objects.delete("my-secret")
        ```

        Secrets will be deleted from the active environment, or another one can be specified:

        ```python notest
        await modal.Secret.objects.delete("my-secret", environment_name="dev")
        ```

        Added in v1.1.2.

        """
        try:
            obj = await _Secret.from_name(name, environment_name=environment_name).hydrate(client)
        except NotFoundError:
            if not allow_missing:
                raise
        else:
            req = api_pb2.SecretDeleteRequest(secret_id=obj.object_id)
            await obj._client.stub.SecretDelete(req)


SecretManager = synchronize_api(_SecretManager)


async def _load_from_env_dict(instance: "_Secret", load_context: LoadContext, env_dict: dict[str, str]):
    """helper method for loaders .from_dict and .from_dotenv etc."""
    if load_context.app_id is not None:
        req = api_pb2.SecretGetOrCreateRequest(
            object_creation_type=api_pb2.OBJECT_CREATION_TYPE_ANONYMOUS_OWNED_BY_APP,
            env_dict=env_dict,
            app_id=load_context.app_id,
            environment_name=load_context.environment_name,
        )
    else:
        req = api_pb2.SecretGetOrCreateRequest(
            object_creation_type=api_pb2.OBJECT_CREATION_TYPE_EPHEMERAL,
            env_dict=env_dict,
            environment_name=load_context.environment_name,
        )

    resp = await load_context.client.stub.SecretGetOrCreate(req)
    instance._hydrate(resp.secret_id, load_context.client, resp.metadata)


class _Secret(_Object, type_prefix="st"):
    """Secrets provide a dictionary of environment variables for images.

    Secrets are a secure way to add credentials and other sensitive information
    to the containers your functions run in. You can create and edit secrets on
    [the dashboard](https://modal.com/secrets), or programmatically from Python code.

    See [the secrets guide page](https://modal.com/docs/guide/secrets) for more information.
    """

    _metadata: Optional[api_pb2.SecretMetadata] = None

    @classproperty
    def objects(cls) -> _SecretManager:
        return _SecretManager

    @property
    def name(self) -> Optional[str]:
        return self._name

    def _hydrate_metadata(self, metadata: Optional[Message]):
        if metadata:
            assert isinstance(metadata, api_pb2.SecretMetadata)
            self._metadata = metadata
            self._name = metadata.name

    def _get_metadata(self) -> api_pb2.SecretMetadata:
        assert self._metadata
        return self._metadata

    @staticmethod
    def from_dict(
        env_dict: dict[
            str, Optional[str]
        ] = {},  # dict of entries to be inserted as environment variables in functions using the secret
    ) -> "_Secret":
        """Create a secret from a str-str dictionary. Values can also be `None`, which is ignored.

        Usage:
        ```python
        @app.function(secrets=[modal.Secret.from_dict({"FOO": "bar"})])
        def run():
            print(os.environ["FOO"])
        ```
        """
        if not isinstance(env_dict, dict):
            raise InvalidError(ENV_DICT_WRONG_TYPE_ERR)

        env_dict_filtered: dict[str, str] = {k: v for k, v in env_dict.items() if v is not None}
        if not all(isinstance(k, str) for k in env_dict_filtered.keys()):
            raise InvalidError(ENV_DICT_WRONG_TYPE_ERR)
        if not all(isinstance(v, str) for v in env_dict_filtered.values()):
            raise InvalidError(ENV_DICT_WRONG_TYPE_ERR)

        async def _load(
            self: _Secret, resolver: Resolver, load_context: LoadContext, existing_object_id: Optional[str]
        ):
            await _load_from_env_dict(self, load_context, env_dict_filtered)

        rep = f"Secret.from_dict([{', '.join(env_dict.keys())}])"
        # TODO: scoping - these should probably not be lazily hydrated without having an app and/or sandbox association
        return _Secret._from_loader(_load, rep, hydrate_lazily=True, load_context_overrides=LoadContext.empty())

    @staticmethod
    def from_local_environ(
        env_keys: list[str],  # list of local env vars to be included for remote execution
    ) -> "_Secret":
        """Create secrets from local environment variables automatically."""

        if is_local():
            try:
                return _Secret.from_dict({k: os.environ[k] for k in env_keys})
            except KeyError as exc:
                missing_key = exc.args[0]
                raise InvalidError(
                    f"Could not find local environment variable '{missing_key}' for Secret.from_local_environ"
                )

        return _Secret.from_dict({})

    @staticmethod
    def from_dotenv(path=None, *, filename=".env", client: Optional[_Client] = None) -> "_Secret":
        """Create secrets from a .env file automatically.

        If no argument is provided, it will use the current working directory as the starting
        point for finding a `.env` file. Note that it does not use the location of the module
        calling `Secret.from_dotenv`.

        If called with an argument, it will use that as a starting point for finding `.env` files.
        In particular, you can call it like this:
        ```python
        @app.function(secrets=[modal.Secret.from_dotenv(__file__)])
        def run():
            print(os.environ["USERNAME"])  # Assumes USERNAME is defined in your .env file
        ```

        This will use the location of the script calling `modal.Secret.from_dotenv` as a
        starting point for finding the `.env` file.

        A file named `.env` is expected by default, but this can be overridden with the `filename`
        keyword argument:

        ```python
        @app.function(secrets=[modal.Secret.from_dotenv(filename=".env-dev")])
        def run():
            ...
        ```
        """

        async def _load(
            self: _Secret, resolver: Resolver, load_context: LoadContext, existing_object_id: Optional[str]
        ):
            try:
                from dotenv import dotenv_values, find_dotenv
                from dotenv.main import _walk_to_root
            except ImportError:
                raise ImportError(
                    "Need the `dotenv` package installed. You can install it by running `pip install python-dotenv`."
                )

            if path is not None:
                # This basically implements the logic in find_dotenv
                for dirname in _walk_to_root(path):
                    check_path = os.path.join(dirname, filename)
                    if os.path.isfile(check_path):
                        dotenv_path = check_path
                        break
                else:
                    dotenv_path = ""
            else:
                # TODO(erikbern): dotenv tries to locate .env files based on location of the file in the stack frame.
                # Since the modal code "intermediates" this, a .env file in user's local directory won't be picked up.
                # To simplify this, we just support the cwd and don't do any automatic path inference.
                dotenv_path = find_dotenv(filename, usecwd=True)

            env_dict = {k: v or "" for k, v in dotenv_values(dotenv_path).items()}

            await _load_from_env_dict(self, load_context, env_dict)

        return _Secret._from_loader(
            _load, "Secret.from_dotenv()", hydrate_lazily=True, load_context_overrides=LoadContext(client=client)
        )

    @staticmethod
    def from_name(
        name: str,
        *,
        namespace=None,  # mdmd:line-hidden
        environment_name: Optional[str] = None,
        required_keys: list[
            str
        ] = [],  # Optionally, a list of required environment variables (will be asserted server-side)
        client: Optional[_Client] = None,
    ) -> "_Secret":
        """Reference a Secret by its name.

        In contrast to most other Modal objects, named Secrets must be provisioned
        from the Dashboard. See other methods for alternate ways of creating a new
        Secret from code.

        ```python
        secret = modal.Secret.from_name("my-secret")

        @app.function(secrets=[secret])
        def run():
           ...
        ```
        """
        warn_if_passing_namespace(namespace, "modal.Secret.from_name")

        async def _load(
            self: _Secret, resolver: Resolver, load_context: LoadContext, existing_object_id: Optional[str]
        ):
            req = api_pb2.SecretGetOrCreateRequest(
                deployment_name=name,
                environment_name=load_context.environment_name,
                required_keys=required_keys,
            )
            response = await load_context.client.stub.SecretGetOrCreate(req)
            self._hydrate(response.secret_id, load_context.client, response.metadata)

        rep = _Secret._repr(name, environment_name)
        return _Secret._from_loader(
            _load,
            rep,
            hydrate_lazily=True,
            name=name,
            load_context_overrides=LoadContext(environment_name=environment_name, client=client),
        )

    @staticmethod
    async def create_deployed(
        deployment_name: str,
        env_dict: dict[str, str],
        namespace=None,  # mdmd:line-hidden
        client: Optional[_Client] = None,
        environment_name: Optional[str] = None,
        overwrite: bool = False,
    ) -> str:
        """mdmd:hidden"""
        deprecation_warning(
            (2025, 8, 13),
            "The undocumented `modal.Secret.create_deployed` method is deprecated and will be removed "
            "in a future release. It can be replaced with `modal.Secret.objects.create`.",
        )
        return await _Secret._create_deployed(deployment_name, env_dict, namespace, client, environment_name, overwrite)

    @staticmethod
    async def _create_deployed(
        deployment_name: str,
        env_dict: dict[str, str],
        namespace=None,  # mdmd:line-hidden
        client: Optional[_Client] = None,
        environment_name: Optional[str] = None,
        overwrite: bool = False,
    ) -> str:
        """mdmd:hidden"""
        warn_if_passing_namespace(namespace, "modal.Secret.create_deployed")

        check_object_name(deployment_name, "Secret")
        if client is None:
            client = await _Client.from_env()
        if overwrite:
            object_creation_type = api_pb2.OBJECT_CREATION_TYPE_CREATE_OVERWRITE_IF_EXISTS
        else:
            object_creation_type = api_pb2.OBJECT_CREATION_TYPE_CREATE_FAIL_IF_EXISTS
        request = api_pb2.SecretGetOrCreateRequest(
            deployment_name=deployment_name,
            environment_name=_get_environment_name(environment_name),
            object_creation_type=object_creation_type,
            env_dict=env_dict,
        )
        resp = await client.stub.SecretGetOrCreate(request)
        return resp.secret_id

    @live_method
    async def info(self) -> SecretInfo:
        """Return information about the Secret object."""
        metadata = self._get_metadata()
        creation_info = metadata.creation_info
        return SecretInfo(
            name=metadata.name or None,
            created_at=timestamp_to_localized_dt(creation_info.created_at),
            created_by=creation_info.created_by or None,
        )


Secret = synchronize_api(_Secret)
