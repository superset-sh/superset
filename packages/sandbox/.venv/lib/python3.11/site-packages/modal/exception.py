# Copyright Modal Labs 2022
"""
Modal-specific exception types.

## Notes on `grpclib.GRPCError` migration

Historically, the Modal SDK could propagate `grpclib.GRPCError` exceptions out
to user code.  As of v1.3, we are in the process of gracefully migrating to
always raising a Modal exception type in these cases. To avoid breaking user
code that relies on catching `grpclib.GRPCError`, a subset of Modal exception
types temporarily inherit from `grpclib.GRPCError`.

We encourage users to migrate any code that currently catches `grpclib.GRPCError`
to instead catch the appropriate Modal exception type. The following mapping
between GRPCError status codes and Modal exception types is currently in use:

```
CANCELLED -> ServiceError
UNKNOWN -> ServiceError
INVALID_ARGUMENT -> InvalidError
DEADLINE_EXCEEDED -> ServiceError
NOT_FOUND -> NotFoundError
ALREADY_EXISTS -> AlreadyExistsError
PERMISSION_DENIED -> PermissionDeniedError
RESOURCE_EXHAUSTED -> ResourceExhaustedError
FAILED_PRECONDITION -> ConflictError
ABORTED -> ConflictError
OUT_OF_RANGE -> InvalidError
UNIMPLEMENTED -> UnimplementedError
INTERNAL -> InternalError
UNAVAILABLE -> ServiceError
DATA_LOSS -> DataLossError
UNAUTHENTICATED -> AuthError
```

"""

import random
import signal
from typing import Any, Optional

import grpclib
import synchronicity.exceptions

UserCodeException = synchronicity.exceptions.UserCodeException  # Deprecated type used for return_exception wrapping


class Error(Exception):
    """
    Base class for all Modal errors. See [`modal.exception`](https://modal.com/docs/reference/modal.exception)
    for the specialized error classes.

    **Usage**

    ```python notest
    import modal

    try:
        ...
    except modal.Error:
        # Catch any exception raised by Modal's systems.
        print("Responding to error...")
    ```
    """


class _GRPCErrorWrapper(grpclib.GRPCError):
    """This transitional class helps us migrate away from propagating `grpclib.GRPCError` to users.

    It serves two purposes:
    - It avoids abruptly breaking user code that catches `grpclib.GRPCError`
    - It actively warns when users access attributes defined by `grpclib.GRPCError`

    This won't catch all cases (users might react indiscriminately to GRPCError without checking the status).

    The mapping between GRPCError status codes and our error types is defined in `modal._grpc_client`.

    """

    # These will be set on the instance in our error handling middleware
    _grpc_message: str
    _grpc_status: grpclib.Status
    _grpc_details: Any

    def __init__(self, message: Optional[str] = None):
        # Override GRPCError's init and repr to behave more like a regular Exception
        # (We don't customize these anywhere in our custom error types currently).
        self._message = message or ""

    def __repr__(self) -> str:
        return f"{type(self).__name__}({self._message!r})"

    def _warn_on_grpc_error_attribute_access(self) -> None:
        from ._utils.deprecation import deprecation_warning  # Avoid circular import

        exc_type = type(self).__name__
        deprecation_warning(
            (2025, 12, 9),
            "Modal will stop propagating the `grpclib.GRPCError` type in the future. "
            f"Update your code so that it catches `modal.exception.{exc_type}` directly "
            "to avoid changes to error handling behavior in the future.",
            pending=True,
        )

    @property
    def message(self) -> str:
        self._warn_on_grpc_error_attribute_access()
        return self._grpc_message

    @message.setter
    def message(self, value: str) -> None:
        self._grpc_message = value

    @property
    def status(self) -> grpclib.Status:
        self._warn_on_grpc_error_attribute_access()
        return self._grpc_status

    @status.setter
    def status(self, value: grpclib.Status) -> None:
        self._grpc_status = value

    @property
    def details(self) -> Any:
        self._warn_on_grpc_error_attribute_access()
        return self._grpc_details

    @details.setter
    def details(self, value: Any) -> None:
        self._grpc_details = value


class AlreadyExistsError(Error, _GRPCErrorWrapper):
    """Raised when a resource creation conflicts with an existing resource."""


class AuthError(Error, _GRPCErrorWrapper):
    """Raised when a client has missing or invalid authentication."""


class InternalError(Error, _GRPCErrorWrapper):
    """Raised when an internal error occurs in the Modal system."""


class InvalidError(Error, _GRPCErrorWrapper):
    """Raised when user does something invalid."""


class ConflictError(InvalidError, _GRPCErrorWrapper):
    """Raised when a resource conflict occurs between the request and current system state."""


class DataLossError(Error, _GRPCErrorWrapper):
    """Raised when data is lost or corrupted."""


class NotFoundError(Error, _GRPCErrorWrapper):
    """Raised when a requested resource was not found."""


class PermissionDeniedError(Error, _GRPCErrorWrapper):
    """Raised when a user does not have permission to perform the requested operation."""


class ResourceExhaustedError(Error, _GRPCErrorWrapper):
    """Raised when a server-side resource has been exhausted, e.g. a quota or rate limit."""


class ServiceError(Error, _GRPCErrorWrapper):
    """Raised when an error occurs in basic client/server communication."""


class UnimplementedError(Error, _GRPCErrorWrapper):
    """Raised when a requested operation is not implemented or not supported."""


class RemoteError(Error):
    """Raised when an error occurs on the Modal server."""


class TimeoutError(Error):
    """Base class for Modal timeouts."""


class SandboxTimeoutError(TimeoutError):
    """Raised when a Sandbox exceeds its execution duration limit and times out."""


class ExecTimeoutError(TimeoutError):
    """Raised when a container process exceeds its execution duration limit and times out."""


class SandboxTerminatedError(Error):
    """Raised when a Sandbox is terminated for an internal reason."""


class FunctionTimeoutError(TimeoutError):
    """Raised when a Function exceeds its execution duration limit and times out."""


class MountUploadTimeoutError(TimeoutError):
    """Raised when a Mount upload times out."""


class VolumeUploadTimeoutError(TimeoutError):
    """Raised when a Volume upload times out."""


class InteractiveTimeoutError(TimeoutError):
    """Raised when interactive frontends time out while trying to connect to a container."""


class OutputExpiredError(TimeoutError):
    """Raised when the Output exceeds expiration and times out."""


class ConnectionError(Error):
    """Raised when an issue occurs while connecting to the Modal servers."""


class VersionError(Error):
    """Raised when the current client version of Modal is unsupported."""


class ExecutionError(Error):
    """Raised when something unexpected happened during runtime."""


class DeserializationError(Error):
    """Raised to provide more context when an error is encountered during deserialization."""


class SerializationError(Error):
    """Raised to provide more context when an error is encountered during serialization."""


class RequestSizeError(Error):
    """Raised when an operation produces a gRPC request that is rejected by the server for being too large."""


class DeprecationError(UserWarning):
    """UserWarning category emitted when a deprecated Modal feature or API is used."""

    # Overloading it to evade the default filter, which excludes __main__.


class PendingDeprecationError(UserWarning):
    """Soon to be deprecated feature. Only used intermittently because of multi-repo concerns."""


class ServerWarning(UserWarning):
    """Warning originating from the Modal server and re-issued in client code."""


class AsyncUsageWarning(UserWarning):
    """Warning emitted when a blocking Modal interface is used in an async context."""


class InternalFailure(Error):
    """Retriable internal error."""


class _CliUserExecutionError(Exception):
    """mdmd:hidden
    Private wrapper for exceptions during when importing or running Apps from the CLI.

    This intentionally does not inherit from `modal.exception.Error` because it
    is a private type that should never bubble up to users. Exceptions raised in
    the CLI at this stage will have tracebacks printed.
    """

    def __init__(self, user_source: str):
        # `user_source` should be the filepath for the user code that is the source of the exception.
        # This is used by our exception handler to show the traceback starting from that point.
        self.user_source = user_source


def _simulate_preemption_interrupt(signum, frame):
    signal.alarm(30)  # simulate a SIGKILL after 30s
    raise KeyboardInterrupt("Simulated preemption interrupt from modal-client!")


def simulate_preemption(wait_seconds: int, jitter_seconds: int = 0):
    """
    Utility for simulating a preemption interrupt after `wait_seconds` seconds.
    The first interrupt is the SIGINT signal. After 30 seconds, a second
    interrupt will trigger.

    This second interrupt simulates SIGKILL, and should not be caught.
    Optionally add between zero and `jitter_seconds` seconds of additional waiting before first interrupt.

    **Usage:**

    ```python notest
    import time
    from modal.exception import simulate_preemption

    simulate_preemption(3)

    try:
        time.sleep(4)
    except KeyboardInterrupt:
        print("got preempted") # Handle interrupt
        raise
    ```

    See https://modal.com/docs/guide/preemption for more details on preemption
    handling.
    """
    if wait_seconds <= 0:
        raise ValueError("Time to wait must be greater than 0")
    signal.signal(signal.SIGALRM, _simulate_preemption_interrupt)
    jitter = random.randrange(0, jitter_seconds) if jitter_seconds else 0
    signal.alarm(wait_seconds + jitter)


class InputCancellation(BaseException):
    """Raised when the current input is cancelled by the task

    Intentionally a BaseException instead of an Exception, so it won't get
    caught by unspecified user exception clauses that might be used for retries and
    other control flow.
    """


class ModuleNotMountable(Exception):
    pass


class ClientClosed(Error):
    pass


class FilesystemExecutionError(Error):
    """Raised when an unknown error is thrown during a container filesystem operation."""
