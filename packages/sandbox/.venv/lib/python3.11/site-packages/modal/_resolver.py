# Copyright Modal Labs 2023
import asyncio
import contextlib
import os
import tempfile
import typing
from asyncio import Future
from collections.abc import Hashable
from typing import TYPE_CHECKING, Optional

import modal._object
from modal._traceback import suppress_tb_frame
from modal_proto import api_pb2

from ._load_context import LoadContext

if TYPE_CHECKING:
    from rich.tree import Tree


class StatusRow:
    def __init__(self, progress: "typing.Optional[Tree]"):
        self._spinner = None
        self._step_node = None
        if progress is not None:
            from ._output import OutputManager

            self._spinner = OutputManager.step_progress()
            self._step_node = progress.add(self._spinner)

    def message(self, message):
        if self._spinner is not None:
            self._spinner.update(text=message)

    def warning(self, warning: api_pb2.Warning):
        if self._step_node is not None:
            self._step_node.add(f"⚠️ {warning.message}")

    def finish(self, message):
        if self._step_node is not None and self._spinner is not None:
            from ._output import OutputManager

            self._spinner.update(text=message)
            self._step_node.label = OutputManager.substep_completed(message)


class Resolver:
    _local_uuid_to_future: dict[str, Future]
    _deduplication_cache: dict[Hashable, Future]
    _build_start: float

    def __init__(self):
        try:
            # TODO(michael) If we don't clean this up more thoroughly, it would probably
            # be good to have a single source of truth for "rich is installed" rather than
            # doing a try/catch everywhere we want to use it.
            from rich.tree import Tree

            from ._output import OutputManager

            tree = Tree(OutputManager.step_progress("Creating objects..."), guide_style="gray50")
        except ImportError:
            tree = None

        self._local_uuid_to_future = {}
        self._tree = tree
        self._deduplication_cache = {}

        with tempfile.TemporaryFile() as temp_file:
            # Use file mtime to track build start time because we will later compare this baseline
            # to the mtime on mounted files, and want those measurements to have the same resolution.
            self._build_start = os.fstat(temp_file.fileno()).st_mtime

    @property
    def build_start(self) -> float:
        return self._build_start

    async def preload(
        self, obj: "modal._object._Object", parent_load_context: "LoadContext", existing_object_id: Optional[str]
    ):
        if obj._preload is not None:
            load_context = obj._load_context_overrides.merged_with(parent_load_context)
            await obj._preload(obj, self, load_context, existing_object_id)

    async def load(
        self,
        obj: "modal._object._Object",
        parent_load_context: "LoadContext",
        *,
        existing_object_id: Optional[str] = None,
    ):
        if obj._is_hydrated and obj._is_another_app:
            # No need to reload this, it won't typically change
            if obj.local_uuid not in self._local_uuid_to_future:
                # a bit dumb - but we still need to store a reference to the object here
                # to be able to include all referenced objects when setting up the app
                fut: Future = Future()
                fut.set_result(obj)
                self._local_uuid_to_future[obj.local_uuid] = fut
            return obj

        deduplication_key: Optional[Hashable] = None
        if obj._deduplication_key:
            deduplication_key = await obj._deduplication_key()

        cached_future = self._local_uuid_to_future.get(obj.local_uuid)

        if not cached_future and deduplication_key is not None:
            # deduplication cache makes sure duplicate mounts are resolved only
            # once, even if they are different instances - as long as they have
            # the same content
            cached_future = self._deduplication_cache.get(deduplication_key)
            if cached_future:
                hydrated_object = await cached_future
                # Use the client from the already-hydrated object
                obj._hydrate(hydrated_object.object_id, hydrated_object.client, hydrated_object._get_metadata())
                return obj

        if not cached_future:
            # don't run any awaits within this if-block to prevent race conditions
            async def loader():
                with suppress_tb_frame():
                    load_context = await obj._load_context_overrides.merged_with(parent_load_context).apply_defaults()

                    # Use asyncio.gather here (not TaskContext.gather) - the shared TaskContext
                    # in load_context handles cancellation at the top level, preventing premature
                    # cancellation of shared dependencies when sibling tasks fail.
                    await asyncio.gather(*[self.load(dep, load_context) for dep in obj.deps()])

                    # Load the object itself
                    if not obj._load:
                        raise Exception(f"Object {obj} has no loader function")

                    await obj._load(obj, self, load_context, existing_object_id)

                    # Check that the id of functions didn't change
                    # Persisted refs are ignored because their life cycle is managed independently.
                    if (
                        not obj._is_another_app
                        and existing_object_id is not None
                        and existing_object_id.startswith("fu-")
                        and obj.object_id != existing_object_id
                    ):
                        raise Exception(
                            f"Tried creating an object using existing id {existing_object_id} "
                            f"but it has id {obj.object_id}"
                        )

                    return obj

            # use task_context from load_context to make sure tasks are cleaned up eventually
            cached_future = parent_load_context.task_context.create_task(loader())
            self._local_uuid_to_future[obj.local_uuid] = cached_future
            if deduplication_key is not None:
                self._deduplication_cache[deduplication_key] = cached_future
        with suppress_tb_frame():
            return await cached_future

    def objects(self) -> list["modal._object._Object"]:
        unique_objects: dict[str, "modal._object._Object"] = {}
        for fut in self._local_uuid_to_future.values():
            if not fut.done():
                # this will raise an exception if not all loads have been awaited, but that *should* never happen
                raise RuntimeError(
                    "All loaded objects have not been resolved yet, can't get all objects for the resolver!"
                )
            obj = fut.result()
            unique_objects.setdefault(obj.object_id, obj)
        return list(unique_objects.values())

    @contextlib.contextmanager
    def display(self):
        # TODO(erikbern): get rid of this wrapper
        from .output import _get_output_manager

        if self._tree and (output_mgr := _get_output_manager()):
            with output_mgr.make_live(self._tree):
                yield
            self._tree.label = output_mgr.step_completed("Created objects.")
            output_mgr.print(self._tree)
        else:
            yield

    def add_status_row(self) -> StatusRow:
        return StatusRow(self._tree)
