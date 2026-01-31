# Copyright Modal Labs 2025
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional, TypedDict

from modal_proto import api_pb2

from .client import _Client
from .exception import InvalidError


class WorkspaceBillingReportItem(TypedDict):
    object_id: str
    description: str
    environment_name: str
    interval_start: datetime
    cost: Decimal
    tags: dict[str, str]


async def _workspace_billing_report(
    *,
    start: datetime,  # Start of the report, inclusive
    end: Optional[datetime] = None,  # End of the report, exclusive
    resolution: str = "d",  # Resolution, e.g. "d" for daily or "h" for hourly
    tag_names: Optional[list[str]] = None,  # Optional additional metadata to include
    client: Optional[_Client] = None,
) -> list[dict[str, Any]]:
    """Generate a tabular report of workspace usage by object and time.

    The result will be a list of dictionaries for each interval (determined by `resolution`)
    between the `start` and `end` limits. The dictionary represents a single Modal object
    that billing can be attributed to (e.g., an App) along with metadata (including user-defined
    tags) for identifying that object.

    The `start` and `end` parameters are required to either have a UTC timezone or to be
    timezone-naive (which will be interpreted as UTC times). The timestamps in the result will
    be in UTC. Cost will be reported for full intervals, even if the provided `start` or `end`
    parameters are partial: `start` will be rounded to the beginning of its interval, while
    partial `end` intervals will be excluded.

    Additional user-provided metadata can be included in the report if the objects have tags
    and `tag_names` (i.e., keys) are specified in the request. Note that tags will be attributed
    to the entire interval even if they were added or removed at some point within it.

    """
    if client is None:
        client = await _Client.from_env()

    tag_names = tag_names or []

    if end is None:
        end = datetime.now(timezone.utc)

    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    elif start.tzinfo != timezone.utc:
        raise InvalidError("Timezone-aware 'start' parameter must be in UTC.")

    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    elif end.tzinfo != timezone.utc:
        raise InvalidError("Timezone-aware 'end' parameter must be in UTC.")

    request = api_pb2.WorkspaceBillingReportRequest(
        resolution=resolution,
        tag_names=tag_names,
    )
    request.start_timestamp.FromDatetime(start)
    request.end_timestamp.FromDatetime(end)

    rows = []
    async for pb_item in client.stub.WorkspaceBillingReport.unary_stream(request):
        item = {
            "object_id": pb_item.object_id,
            "description": pb_item.description,
            "environment_name": pb_item.environment_name,
            "interval_start": pb_item.interval.ToDatetime().replace(tzinfo=timezone.utc),
            "cost": Decimal(pb_item.cost),
            "tags": dict(pb_item.tags),
        }
        rows.append(item)

    return rows
