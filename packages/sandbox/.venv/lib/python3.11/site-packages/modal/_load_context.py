# Copyright Modal Labs 2025
from typing import TYPE_CHECKING, Optional

from .client import _Client
from .config import config

if TYPE_CHECKING:
    from ._utils.async_utils import TaskContext


class LoadContext:
    """Encapsulates optional metadata values used during object loading.

    This metadata is set during object construction and propagated through
    parent-child relationships (e.g., App -> Function, Cls -> Obj -> bound methods).
    """

    _client: Optional[_Client] = None
    _environment_name: Optional[str] = None
    _app_id: Optional[str] = None
    _task_context: Optional["TaskContext"] = None

    def __init__(
        self,
        *,
        client: Optional[_Client] = None,
        environment_name: Optional[str] = None,
        app_id: Optional[str] = None,
        task_context: Optional["TaskContext"] = None,
    ):
        self._client = client
        self._environment_name = environment_name
        self._app_id = app_id
        self._task_context = task_context

    @property
    def client(self) -> _Client:
        assert self._client is not None
        return self._client

    @property
    def environment_name(self) -> str:
        assert self._environment_name is not None
        return self._environment_name

    @property
    def app_id(self) -> Optional[str]:
        return self._app_id

    @property
    def task_context(self) -> "TaskContext":
        assert self._task_context is not None, "LoadContext has no TaskContext"
        return self._task_context

    @classmethod
    def empty(cls) -> "LoadContext":
        """Create an empty LoadContext with all fields set to None.

        Used when loading objects that don't have a parent context.
        """
        return cls(client=None, environment_name=None, app_id=None)

    def merged_with(self, parent: "LoadContext") -> "LoadContext":
        """Create a new LoadContext with parent values filling in None fields.

        Returns a new LoadContext without mutating self or parent.
        Values from self take precedence over values from parent.
        """
        return LoadContext(
            client=self._client if self._client is not None else parent._client,
            environment_name=self._environment_name if self._environment_name is not None else parent._environment_name,
            app_id=self._app_id if self._app_id is not None else parent._app_id,
            task_context=self._task_context if self._task_context is not None else parent._task_context,
        )  # TODO (elias):  apply_defaults?

    async def apply_defaults(self) -> "LoadContext":
        """Infer default client and environment_name if not present

        Returns a new instance (no in place mutation)"""

        is_valid_client = self._client is not None and not self._client._snapshotted
        return LoadContext(
            client=self.client if is_valid_client else await _Client.from_env(),
            environment_name=self._environment_name or config.get("environment") or "",
            app_id=self._app_id,
            task_context=self._task_context,
        )

    def reset(self) -> "LoadContext":
        """In-place replace all values with None, such that any inferred values/upgrades
        will work. This is useful in cases where a load context reference may have leaked
        into objects and used/upgraded but you want to make a fresh re-load, e.g. when doing
        multiple `app.run()` calls in the same interpreter session.
        """
        self._client = None
        self._environment_name = None
        self._app_id = None
        self._task_context = None
        return self

    async def in_place_upgrade(
        self,
        client: Optional[_Client] = None,
        environment_name: Optional[str] = None,
        app_id: Optional[str] = None,
        task_context: Optional["TaskContext"] = None,
    ) -> "LoadContext":
        """In-place set values if they aren't already set, or set default values

        Intended for Function/Cls hydration specifically

        In those cases, it's important to in-place upgrade/apply_defaults since any "sibling" of the function/cls
        would share the load context with its parent, and the initial load context overrides may not be sufficient
        since an `app.deploy()` etc could get arguments that set a new client etc.

        E.g.
        @app.function()
        def f():
            ...

        f2 = Function.with_options(...)

        with app.run(client=...): # hydrates f and f2 at this point
            ...
        """
        self._client = self._client or client or await _Client.from_env()
        self._environment_name = self._environment_name or environment_name or config.get("environment") or ""
        self._app_id = self._app_id or app_id
        self._task_context = self._task_context or task_context
        return self
