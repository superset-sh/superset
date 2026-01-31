import modal._object
import modal.client
import modal.object
import typing
import typing_extensions

SUPERSELF = typing.TypeVar("SUPERSELF", covariant=True)

class _SandboxSnapshot(modal._object._Object):
    """> Sandbox memory snapshots are in **early preview**.

    A `SandboxSnapshot` object lets you interact with a stored Sandbox snapshot that was created by calling
    `._experimental_snapshot()` on a Sandbox instance. This includes both the filesystem and memory state of
    the original Sandbox at the time the snapshot was taken.
    """
    class __from_id_spec(typing_extensions.Protocol[SUPERSELF]):
        def __call__(
            self, /, sandbox_snapshot_id: str, client: typing.Optional[modal.client.Client] = None
        ) -> SUPERSELF:
            """Construct a `SandboxSnapshot` object from a sandbox snapshot ID."""
            ...

        async def aio(self, /, sandbox_snapshot_id: str, client: typing.Optional[modal.client.Client] = None): ...

    from_id: typing.ClassVar[__from_id_spec[typing_extensions.Self]]

class SandboxSnapshot(modal.object.Object):
    """> Sandbox memory snapshots are in **early preview**.

    A `SandboxSnapshot` object lets you interact with a stored Sandbox snapshot that was created by calling
    `._experimental_snapshot()` on a Sandbox instance. This includes both the filesystem and memory state of
    the original Sandbox at the time the snapshot was taken.
    """
    def __init__(self, *args, **kwargs):
        """mdmd:hidden"""
        ...

    class __from_id_spec(typing_extensions.Protocol[SUPERSELF]):
        def __call__(
            self, /, sandbox_snapshot_id: str, client: typing.Optional[modal.client.Client] = None
        ) -> SUPERSELF:
            """Construct a `SandboxSnapshot` object from a sandbox snapshot ID."""
            ...

        async def aio(self, /, sandbox_snapshot_id: str, client: typing.Optional[modal.client.Client] = None): ...

    from_id: typing.ClassVar[__from_id_spec[typing_extensions.Self]]
