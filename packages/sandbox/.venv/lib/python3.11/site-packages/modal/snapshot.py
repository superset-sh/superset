# Copyright Modal Labs 2024
from typing import Optional, cast

import typing_extensions

import modal.client
from modal_proto import api_pb2

from ._load_context import LoadContext
from ._object import _Object
from ._resolver import Resolver
from ._utils.async_utils import deprecate_aio_usage, synchronize_api, synchronizer
from .client import _Client


class _SandboxSnapshot(_Object, type_prefix="sn"):
    """
    > Sandbox memory snapshots are in **early preview**.

    A `SandboxSnapshot` object lets you interact with a stored Sandbox snapshot that was created by calling
    `._experimental_snapshot()` on a Sandbox instance. This includes both the filesystem and memory state of
    the original Sandbox at the time the snapshot was taken.
    """

    @deprecate_aio_usage((2025, 12, 5), "SandboxSnapshot.from_id")
    @classmethod
    def from_id(
        cls, sandbox_snapshot_id: str, client: Optional["modal.client.Client"] = None
    ) -> typing_extensions.Self:
        """
        Construct a `SandboxSnapshot` object from a sandbox snapshot ID.
        """
        _client = cast(_Client, synchronizer._translate_in(client))

        async def _load(
            self: _SandboxSnapshot, resolver: Resolver, load_context: LoadContext, existing_object_id: Optional[str]
        ):
            # hydration doesn't actually do much apart from validating the existance of the id
            # which is implicitly done by trying to start a sandbox from the snapshot as well
            resp: api_pb2.SandboxSnapshotGetResponse = await load_context.client.stub.SandboxSnapshotGet(
                api_pb2.SandboxSnapshotGetRequest(snapshot_id=sandbox_snapshot_id)
            )
            self._hydrate(resp.snapshot_id, load_context.client, None)

        rep = "SandboxSnapshot()"
        obj = _SandboxSnapshot._from_loader(
            _load, rep, load_context_overrides=LoadContext(client=_client), hydrate_lazily=True
        )
        # Setting the object id directly is a bit hacky, but
        # it avoids hydrating the object fully if it's going
        # to be used only for its object id anyway
        obj._object_id = sandbox_snapshot_id
        return cast(typing_extensions.Self, synchronizer._translate_out(obj))


SandboxSnapshot = synchronize_api(_SandboxSnapshot)
