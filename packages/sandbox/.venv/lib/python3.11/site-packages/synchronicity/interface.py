import enum


class Interface(enum.Enum):
    BLOCKING = enum.auto()
    _ASYNC_WITH_BLOCKING_TYPES = enum.auto()  # this is *only* used for functions, since all types are blocking


# Default names for classes
DEFAULT_CLASS_PREFIX = "Blocking"

# Default names for functions
DEFAULT_FUNCTION_PREFIXES = {
    Interface.BLOCKING: "blocking_",
    # this is only used internally - usage will be via `.aio` on the blocking function:
    Interface._ASYNC_WITH_BLOCKING_TYPES: "aio_",
}
