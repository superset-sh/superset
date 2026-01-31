import datetime
import google.protobuf.message
import modal._load_context
import modal._object
import modal.client
import modal.object
import modal_proto.api_pb2
import synchronicity
import typing
import typing_extensions

class SecretInfo:
    """Information about the Secret object."""

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

class _SecretManager:
    """Namespace with methods for managing named Secret objects."""
    @staticmethod
    async def create(
        name: str,
        env_dict: dict[str, str],
        *,
        allow_existing: bool = False,
        environment_name: typing.Optional[str] = None,
        client: typing.Optional[modal.client._Client] = None,
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
        ...

    @staticmethod
    async def list(
        *,
        max_objects: typing.Optional[int] = None,
        created_before: typing.Union[datetime.datetime, str, None] = None,
        environment_name: str = "",
        client: typing.Optional[modal.client._Client] = None,
    ) -> list[_Secret]:
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
        ...

    @staticmethod
    async def delete(
        name: str,
        *,
        allow_missing: bool = False,
        environment_name: typing.Optional[str] = None,
        client: typing.Optional[modal.client._Client] = None,
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
        ...

class SecretManager:
    """Namespace with methods for managing named Secret objects."""
    def __init__(self, /, *args, **kwargs):
        """Initialize self.  See help(type(self)) for accurate signature."""
        ...

    class __create_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            name: str,
            env_dict: dict[str, str],
            *,
            allow_existing: bool = False,
            environment_name: typing.Optional[str] = None,
            client: typing.Optional[modal.client.Client] = None,
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
            ...

        async def aio(
            self,
            /,
            name: str,
            env_dict: dict[str, str],
            *,
            allow_existing: bool = False,
            environment_name: typing.Optional[str] = None,
            client: typing.Optional[modal.client.Client] = None,
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
        ) -> list[Secret]:
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
            ...

        async def aio(
            self,
            /,
            *,
            max_objects: typing.Optional[int] = None,
            created_before: typing.Union[datetime.datetime, str, None] = None,
            environment_name: str = "",
            client: typing.Optional[modal.client.Client] = None,
        ) -> list[Secret]:
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
            ...

    delete: typing.ClassVar[__delete_spec]

async def _load_from_env_dict(
    instance: _Secret, load_context: modal._load_context.LoadContext, env_dict: dict[str, str]
):
    """helper method for loaders .from_dict and .from_dotenv etc."""
    ...

class _Secret(modal._object._Object):
    """Secrets provide a dictionary of environment variables for images.

    Secrets are a secure way to add credentials and other sensitive information
    to the containers your functions run in. You can create and edit secrets on
    [the dashboard](https://modal.com/secrets), or programmatically from Python code.

    See [the secrets guide page](https://modal.com/docs/guide/secrets) for more information.
    """

    _metadata: typing.Optional[modal_proto.api_pb2.SecretMetadata]

    @synchronicity.classproperty
    def objects(cls) -> _SecretManager: ...
    @property
    def name(self) -> typing.Optional[str]: ...
    def _hydrate_metadata(self, metadata: typing.Optional[google.protobuf.message.Message]): ...
    def _get_metadata(self) -> modal_proto.api_pb2.SecretMetadata: ...
    @staticmethod
    def from_dict(env_dict: dict[str, typing.Optional[str]] = {}) -> _Secret:
        """Create a secret from a str-str dictionary. Values can also be `None`, which is ignored.

        Usage:
        ```python
        @app.function(secrets=[modal.Secret.from_dict({"FOO": "bar"})])
        def run():
            print(os.environ["FOO"])
        ```
        """
        ...

    @staticmethod
    def from_local_environ(env_keys: list[str]) -> _Secret:
        """Create secrets from local environment variables automatically."""
        ...

    @staticmethod
    def from_dotenv(path=None, *, filename=".env", client: typing.Optional[modal.client._Client] = None) -> _Secret:
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
        ...

    @staticmethod
    def from_name(
        name: str,
        *,
        namespace=None,
        environment_name: typing.Optional[str] = None,
        required_keys: list[str] = [],
        client: typing.Optional[modal.client._Client] = None,
    ) -> _Secret:
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
        ...

    @staticmethod
    async def create_deployed(
        deployment_name: str,
        env_dict: dict[str, str],
        namespace=None,
        client: typing.Optional[modal.client._Client] = None,
        environment_name: typing.Optional[str] = None,
        overwrite: bool = False,
    ) -> str:
        """mdmd:hidden"""
        ...

    @staticmethod
    async def _create_deployed(
        deployment_name: str,
        env_dict: dict[str, str],
        namespace=None,
        client: typing.Optional[modal.client._Client] = None,
        environment_name: typing.Optional[str] = None,
        overwrite: bool = False,
    ) -> str:
        """mdmd:hidden"""
        ...

    async def info(self) -> SecretInfo:
        """Return information about the Secret object."""
        ...

class Secret(modal.object.Object):
    """Secrets provide a dictionary of environment variables for images.

    Secrets are a secure way to add credentials and other sensitive information
    to the containers your functions run in. You can create and edit secrets on
    [the dashboard](https://modal.com/secrets), or programmatically from Python code.

    See [the secrets guide page](https://modal.com/docs/guide/secrets) for more information.
    """

    _metadata: typing.Optional[modal_proto.api_pb2.SecretMetadata]

    def __init__(self, *args, **kwargs):
        """mdmd:hidden"""
        ...

    @synchronicity.classproperty
    def objects(cls) -> SecretManager: ...
    @property
    def name(self) -> typing.Optional[str]: ...
    def _hydrate_metadata(self, metadata: typing.Optional[google.protobuf.message.Message]): ...
    def _get_metadata(self) -> modal_proto.api_pb2.SecretMetadata: ...
    @staticmethod
    def from_dict(env_dict: dict[str, typing.Optional[str]] = {}) -> Secret:
        """Create a secret from a str-str dictionary. Values can also be `None`, which is ignored.

        Usage:
        ```python
        @app.function(secrets=[modal.Secret.from_dict({"FOO": "bar"})])
        def run():
            print(os.environ["FOO"])
        ```
        """
        ...

    @staticmethod
    def from_local_environ(env_keys: list[str]) -> Secret:
        """Create secrets from local environment variables automatically."""
        ...

    @staticmethod
    def from_dotenv(path=None, *, filename=".env", client: typing.Optional[modal.client.Client] = None) -> Secret:
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
        ...

    @staticmethod
    def from_name(
        name: str,
        *,
        namespace=None,
        environment_name: typing.Optional[str] = None,
        required_keys: list[str] = [],
        client: typing.Optional[modal.client.Client] = None,
    ) -> Secret:
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
        ...

    class __create_deployed_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            deployment_name: str,
            env_dict: dict[str, str],
            namespace=None,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
            overwrite: bool = False,
        ) -> str:
            """mdmd:hidden"""
            ...

        async def aio(
            self,
            /,
            deployment_name: str,
            env_dict: dict[str, str],
            namespace=None,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
            overwrite: bool = False,
        ) -> str:
            """mdmd:hidden"""
            ...

    create_deployed: typing.ClassVar[__create_deployed_spec]

    class ___create_deployed_spec(typing_extensions.Protocol):
        def __call__(
            self,
            /,
            deployment_name: str,
            env_dict: dict[str, str],
            namespace=None,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
            overwrite: bool = False,
        ) -> str:
            """mdmd:hidden"""
            ...

        async def aio(
            self,
            /,
            deployment_name: str,
            env_dict: dict[str, str],
            namespace=None,
            client: typing.Optional[modal.client.Client] = None,
            environment_name: typing.Optional[str] = None,
            overwrite: bool = False,
        ) -> str:
            """mdmd:hidden"""
            ...

    _create_deployed: typing.ClassVar[___create_deployed_spec]

    class __info_spec(typing_extensions.Protocol):
        def __call__(self, /) -> SecretInfo:
            """Return information about the Secret object."""
            ...

        async def aio(self, /) -> SecretInfo:
            """Return information about the Secret object."""
            ...

    info: __info_spec
