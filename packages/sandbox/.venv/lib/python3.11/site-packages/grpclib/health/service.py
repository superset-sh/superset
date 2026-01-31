import asyncio

from typing import TYPE_CHECKING, Set, Collection, Mapping, Dict, Any, Optional
from itertools import chain

from ..const import Status
from ..utils import _service_name
from ..server import Stream

from .v1.health_pb2 import HealthCheckRequest, HealthCheckResponse
from .v1.health_grpc import HealthBase


if TYPE_CHECKING:
    from .check import CheckBase  # noqa
    from .._typing import ICheckable  # noqa


def _status(
    checks: Set['CheckBase'],
) -> 'HealthCheckResponse.ServingStatus.ValueType':
    statuses = {check.__status__() for check in checks}
    if statuses == {None}:
        return HealthCheckResponse.UNKNOWN
    elif statuses == {True}:
        return HealthCheckResponse.SERVING
    else:
        return HealthCheckResponse.NOT_SERVING


def _reset_waits(
    events: Collection[asyncio.Event],
    waits: Mapping[asyncio.Event, 'asyncio.Task[bool]'],
) -> Dict[asyncio.Event, 'asyncio.Task[bool]']:
    new_waits = {}
    for event in events:
        wait = waits.get(event)
        if wait is None or wait.done():
            event.clear()
            wait = asyncio.ensure_future(event.wait())
        new_waits[event] = wait
    return new_waits


class _Overall:
    # `_service_name` should return '' (empty string) for this service
    def __mapping__(self) -> Dict[str, Any]:
        return {'//': None}


#: Represents overall health status of all services
OVERALL = _Overall()

_ChecksConfig = Mapping['ICheckable', Collection['CheckBase']]


class Health(HealthBase):
    """Health-checking service

    Example:

    .. code-block:: python3

        from grpclib.health.service import Health

        auth = AuthService()
        billing = BillingService()

        health = Health({
            auth: [redis_status],
            billing: [db_check],
        })

        server = Server([auth, billing, health])

    """
    def __init__(self, checks: Optional[_ChecksConfig] = None) -> None:
        if checks is None:
            checks = {OVERALL: []}
        elif OVERALL not in checks:
            checks = dict(checks)
            checks[OVERALL] = list(chain.from_iterable(checks.values()))

        self._checks = {_service_name(s): set(check_list)
                        for s, check_list in checks.items()}

    async def Check(
        self,
        stream: Stream[HealthCheckRequest, HealthCheckResponse],
    ) -> None:
        """Implements synchronous periodic checks"""
        request = await stream.recv_message()
        assert request is not None
        checks = self._checks.get(request.service)
        if checks is None:
            await stream.send_trailing_metadata(status=Status.NOT_FOUND)
        elif len(checks) == 0:
            await stream.send_message(HealthCheckResponse(
                status=HealthCheckResponse.SERVING,
            ))
        else:
            for check in checks:
                await check.__check__()
            await stream.send_message(HealthCheckResponse(
                status=_status(checks),
            ))

    async def Watch(
        self,
        stream: Stream[HealthCheckRequest, HealthCheckResponse],
    ) -> None:
        request = await stream.recv_message()
        assert request is not None
        checks = self._checks.get(request.service)
        if checks is None:
            await stream.send_message(HealthCheckResponse(
                status=HealthCheckResponse.SERVICE_UNKNOWN,
            ))
            while True:
                await asyncio.sleep(3600)
        elif len(checks) == 0:
            await stream.send_message(HealthCheckResponse(
                status=HealthCheckResponse.SERVING,
            ))
            while True:
                await asyncio.sleep(3600)
        else:
            events = []
            for check in checks:
                events.append(await check.__subscribe__())
            waits = _reset_waits(events, {})
            try:
                await stream.send_message(HealthCheckResponse(
                    status=_status(checks),
                ))
                while True:
                    await asyncio.wait(waits.values(),
                                       return_when=asyncio.FIRST_COMPLETED)
                    waits = _reset_waits(events, waits)
                    await stream.send_message(HealthCheckResponse(
                        status=_status(checks),
                    ))
            finally:
                for check, event in zip(checks, events):
                    await check.__unsubscribe__(event)
                for wait in waits.values():
                    if not wait.done():
                        wait.cancel()
