import abc
import time
import asyncio
import logging
import warnings

from typing import Optional, Set, Callable, Awaitable

from ..utils import DeadlineWrapper
from ..metadata import Deadline


log = logging.getLogger(__name__)

DEFAULT_CHECK_TTL = 30
DEFAULT_CHECK_TIMEOUT = 10

_Status = Optional[bool]


class CheckBase(abc.ABC):

    @abc.abstractmethod
    def __status__(self) -> _Status:
        pass

    @abc.abstractmethod
    async def __check__(self) -> _Status:
        pass

    @abc.abstractmethod
    async def __subscribe__(self) -> asyncio.Event:
        pass

    @abc.abstractmethod
    async def __unsubscribe__(self, event: asyncio.Event) -> None:
        pass


class ServiceCheck(CheckBase):
    """Performs periodic checks

    Example:

    .. code-block:: python3

        async def db_test():
            # raised exceptions are the same as returning False,
            # except that exceptions will be logged
            await db.execute('SELECT 1;')
            return True

        db_check = ServiceCheck(db_test)
    """
    _value = None
    _poll_task = None
    _last_check = None

    def __init__(
        self,
        func: Callable[[], Awaitable[_Status]],
        *,
        loop: Optional[asyncio.AbstractEventLoop] = None,
        check_ttl: float = DEFAULT_CHECK_TTL,
        check_timeout: float = DEFAULT_CHECK_TIMEOUT,
    ) -> None:
        """
        :param func: callable object which returns awaitable object, where
            result is one of: ``True`` (healthy), ``False`` (unhealthy), or
            ``None`` (unknown)
        :param loop: (deprecated) asyncio-compatible event loop
        :param check_ttl: how long we can cache result of the previous check
        :param check_timeout: timeout for this check
        """
        self._func = func
        self._check_ttl = check_ttl
        self._check_timeout = check_timeout

        self._events: Set[asyncio.Event] = set()

        if loop:
            warnings.warn("The loop argument is deprecated and scheduled "
                          "for removal in grpclib 0.5",
                          DeprecationWarning, stacklevel=2)

        self._check_lock = asyncio.Event()
        self._check_lock.set()

        self._check_wrapper = DeadlineWrapper()

    def __status__(self) -> _Status:
        return self._value

    async def __check__(self) -> _Status:
        if (
            self._last_check is not None
            and time.monotonic() - self._last_check < self._check_ttl
        ):
            return self._value

        if not self._check_lock.is_set():
            # wait until concurrent check succeed
            await self._check_lock.wait()
            return self._value

        prev_value = self._value
        self._check_lock.clear()
        try:
            deadline = Deadline.from_timeout(self._check_timeout)
            with self._check_wrapper.start(deadline):
                value = await self._func()
            if value is not None and not isinstance(value, bool):
                raise TypeError('Invalid status type: {!r}'.format(value))
            self._value = value
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception('Health check failed')
            self._value = False
        finally:
            self._check_lock.set()

        self._last_check = time.monotonic()
        if self._value != prev_value:
            log_level = log.info if self._value else log.warning
            log_level('Health check %r status changed to %r',
                      self._func, self._value)
            # notify all watchers that this check was changed
            for event in self._events:
                event.set()
        return self._value

    async def _poll(self) -> None:
        while True:
            status = await self.__check__()
            if status:
                await asyncio.sleep(self._check_ttl)
            else:
                await asyncio.sleep(self._check_ttl)  # TODO: change interval?

    async def __subscribe__(self) -> asyncio.Event:
        if self._poll_task is None:
            loop = asyncio.get_event_loop()
            self._poll_task = loop.create_task(self._poll())

        event = asyncio.Event()
        self._events.add(event)
        return event

    async def __unsubscribe__(self, event: asyncio.Event) -> None:
        self._events.discard(event)

        if not self._events:
            assert self._poll_task is not None
            task = self._poll_task
            self._poll_task = None
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass


class ServiceStatus(CheckBase):
    """Contains status of a proactive check

    Example:

    .. code-block:: python3

        redis_status = ServiceStatus()

        # detected that Redis is available
        redis_status.set(True)

        # detected that Redis is unavailable
        redis_status.set(False)
    """
    def __init__(
        self,
        *,
        loop: Optional[asyncio.AbstractEventLoop] = None,
    ) -> None:
        """
        :param loop: (deprecated) asyncio-compatible event loop
        """
        if loop:
            warnings.warn("The loop argument is deprecated and scheduled "
                          "for removal in grpclib 0.5",
                          DeprecationWarning, stacklevel=2)

        self._value: _Status = None
        self._events: Set[asyncio.Event] = set()

    def set(self, value: _Status) -> None:
        """Sets current status of a check

        :param value: ``True`` (healthy), ``False`` (unhealthy), or ``None``
            (unknown)
        """
        prev_value = self._value
        self._value = value
        if self._value != prev_value:
            # notify all watchers that this check was changed
            for event in self._events:
                event.set()

    def __status__(self) -> _Status:
        return self._value

    async def __check__(self) -> _Status:
        return self._value

    async def __subscribe__(self) -> asyncio.Event:
        event = asyncio.Event()
        self._events.add(event)
        return event

    async def __unsubscribe__(self, event: asyncio.Event) -> None:
        self._events.discard(event)
