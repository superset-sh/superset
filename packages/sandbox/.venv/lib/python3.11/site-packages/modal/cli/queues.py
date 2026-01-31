# Copyright Modal Labs 2024
from datetime import datetime
from typing import Optional

import typer
from typer import Argument, Option, Typer

from modal._load_context import LoadContext
from modal._output import make_console
from modal._resolver import Resolver
from modal._utils.async_utils import TaskContext, synchronizer
from modal._utils.time_utils import timestamp_to_localized_str
from modal.cli.utils import ENV_OPTION, YES_OPTION, display_table
from modal.client import _Client
from modal.environments import ensure_env
from modal.queue import _Queue
from modal_proto import api_pb2

queue_cli = Typer(
    name="queue",
    no_args_is_help=True,
    help="Manage `modal.Queue` objects and inspect their contents.",
)

PARTITION_OPTION = Option(
    None,
    "-p",
    "--partition",
    help="Name of the partition to use, otherwise use the default (anonymous) partition.",
)


@queue_cli.command(name="create", rich_help_panel="Management")
@synchronizer.create_blocking
async def create(name: str, *, env: Optional[str] = ENV_OPTION):
    """Create a named Queue.

    Note: This is a no-op when the Queue already exists.
    """
    q = _Queue.from_name(name, environment_name=env, create_if_missing=True)
    client = await _Client.from_env()
    resolver = Resolver()
    async with TaskContext() as tc:
        load_context = LoadContext(client=client, environment_name=env, task_context=tc)
        await resolver.load(q, load_context)


@queue_cli.command(name="delete", rich_help_panel="Management")
@synchronizer.create_blocking
async def delete(
    name: str,
    *,
    allow_missing: bool = Option(False, "--allow-missing", help="Don't error if the Queue doesn't exist."),
    yes: bool = YES_OPTION,
    env: Optional[str] = ENV_OPTION,
):
    """Delete a named Queue and all of its data."""
    env = ensure_env(env)
    if not yes:
        typer.confirm(
            f"Are you sure you want to irrevocably delete the modal.Queue '{name}'?",
            default=False,
            abort=True,
        )
    await _Queue.objects.delete(name, environment_name=env, allow_missing=allow_missing)


@queue_cli.command(name="list", rich_help_panel="Management")
@synchronizer.create_blocking
async def list_(*, json: bool = False, env: Optional[str] = ENV_OPTION):
    """List all named Queues."""
    env = ensure_env(env)
    client = await _Client.from_env()
    max_total_size = 100_000  # Limit on the *Queue size* that we report

    items: list[api_pb2.QueueListResponse.QueueInfo] = []

    # Note that we need to continue using the gRPC API directly here rather than using Queue.objects.list.
    # There is some metadata that historically appears in the CLI output (num_partitions, total_size) that
    # doesn't make sense to transmit as hydration metadata, because the values can change over time and
    # the metadata retrieved at hydration time could get stale. Alternatively, we could rewrite this using
    # only public API by sequentially retrieving the queues and then querying their dynamic metadata, but
    # that would require multiple round trips and would add lag to the CLI.
    async def retrieve_page(created_before: float) -> bool:
        max_page_size = 100
        pagination = api_pb2.ListPagination(max_objects=max_page_size, created_before=created_before)
        req = api_pb2.QueueListRequest(environment_name=env, pagination=pagination, total_size_limit=max_total_size)
        resp = await client.stub.QueueList(req)
        items.extend(resp.queues)
        return len(resp.queues) < max_page_size

    finished = await retrieve_page(datetime.now().timestamp())
    while True:
        if finished:
            break
        finished = await retrieve_page(items[-1].metadata.creation_info.created_at)

    queues = [_Queue._new_hydrated(item.queue_id, client, item.metadata, is_another_app=True) for item in items]

    rows = []
    for obj, resp_data in zip(queues, items):
        info = await obj.info()
        rows.append(
            (
                obj.name,
                timestamp_to_localized_str(info.created_at.timestamp(), json),
                info.created_by,
                str(resp_data.num_partitions),
                str(resp_data.total_size) if resp_data.total_size <= max_total_size else f">{max_total_size}",
            )
        )
    display_table(["Name", "Created at", "Created by", "Partitions", "Total size"], rows, json)


@queue_cli.command(name="clear", rich_help_panel="Management")
@synchronizer.create_blocking
async def clear(
    name: str,
    partition: Optional[str] = PARTITION_OPTION,
    all: bool = Option(False, "-a", "--all", help="Clear the contents of all partitions."),
    yes: bool = YES_OPTION,
    *,
    env: Optional[str] = ENV_OPTION,
):
    """Clear the contents of a queue by removing all of its data."""
    q = _Queue.from_name(name, environment_name=env)
    if not yes:
        typer.confirm(
            f"Are you sure you want to irrevocably delete the contents of modal.Queue '{name}'?",
            default=False,
            abort=True,
        )
    await q.clear(partition=partition, all=all)


@queue_cli.command(name="peek", rich_help_panel="Inspection")
@synchronizer.create_blocking
async def peek(
    name: str, n: int = Argument(1), partition: Optional[str] = PARTITION_OPTION, *, env: Optional[str] = ENV_OPTION
):
    """Print the next N items in the queue or queue partition (without removal)."""
    q = _Queue.from_name(name, environment_name=env)
    console = make_console()
    i = 0
    async for item in q.iterate(partition=partition):
        console.print(item)
        i += 1
        if i >= n:
            break


@queue_cli.command(name="len", rich_help_panel="Inspection")
@synchronizer.create_blocking
async def len_(
    name: str,
    partition: Optional[str] = PARTITION_OPTION,
    total: bool = Option(False, "-t", "--total", help="Compute the sum of the queue lengths across all partitions"),
    *,
    env: Optional[str] = ENV_OPTION,
):
    """Print the length of a queue partition or the total length of all partitions."""
    q = _Queue.from_name(name, environment_name=env)
    console = make_console()
    console.print(await q.len(partition=partition, total=total))
