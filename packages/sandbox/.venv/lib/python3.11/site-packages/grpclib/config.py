from typing import Optional, TypeVar, Callable, Any, Union, cast
from dataclasses import dataclass, field, fields, replace, is_dataclass


class _DefaultType:
    def __repr__(self) -> str:
        return '<default>'


_DEFAULT = _DefaultType()

_ValidatorType = Callable[[str, Any], None]

_ConfigurationType = TypeVar('_ConfigurationType')

_WMIN = 2 ** 16 - 1
_4MiB = 4 * 2 ** 20
_WMAX = 2 ** 31 - 1


def _optional(validator: _ValidatorType) -> _ValidatorType:
    def proc(name: str, value: Any) -> None:
        if value is not None:
            validator(name, value)
    return proc


def _chain(*validators: _ValidatorType) -> _ValidatorType:
    def proc(name: str, value: Any) -> None:
        for validator in validators:
            validator(name, value)
    return proc


def _of_type(*types: type) -> _ValidatorType:
    def proc(name: str, value: Any) -> None:
        if not isinstance(value, types):
            types_repr = ' or '.join(str(t) for t in types)
            raise TypeError(f'"{name}" should be of type {types_repr}')
    return proc


def _positive(name: str, value: Union[float, int]) -> None:
    if value <= 0:
        raise ValueError(f'"{name}" should be positive')


def _non_negative(name: str, value: Union[float, int]) -> None:
    if value < 0:
        raise ValueError(f'"{name}" should not be negative')


def _range(min_: int, max_: int) -> _ValidatorType:
    def proc(name: str, value: Union[float, int]) -> None:
        if value < min_:
            raise ValueError(f'"{name}" should be higher or equal to {min_}')
        if value > max_:
            raise ValueError(f'"{name}" should be less or equal to {max_}')
    return proc


def _validate(config: 'Configuration') -> None:
    for f in fields(config):
        validate_fn = f.metadata.get('validate')
        if validate_fn is not None:
            value = getattr(config, f.name)
            if value is not _DEFAULT:
                validate_fn(f.name, value)


def _with_defaults(
    cls: _ConfigurationType, metadata_key: str,
) -> _ConfigurationType:
    assert is_dataclass(cls)
    defaults = {}
    for f in fields(cls):
        if getattr(cls, f.name) is _DEFAULT:
            if metadata_key in f.metadata:
                default = f.metadata[metadata_key]
            else:
                default = f.metadata['default']
            defaults[f.name] = default
    return replace(cls, **defaults)  # type: ignore


@dataclass(frozen=True)
class Configuration:
    _keepalive_time: Optional[float] = field(
        default=cast(None, _DEFAULT),
        metadata={
            'validate': _optional(_chain(_of_type(int, float), _positive)),
            'server-default': 7200.0,
            'client-default': None,
            'test-default': None,
        },
    )
    _keepalive_timeout: float = field(
        default=20.0,
        metadata={
            'validate': _chain(_of_type(int, float), _positive),
        },
    )
    _keepalive_permit_without_calls: bool = field(
        default=False,
        metadata={
            'validate': _optional(_of_type(bool)),
        },
    )
    _http2_max_pings_without_data: int = field(
        default=2,
        metadata={
            'validate': _optional(_chain(_of_type(int), _non_negative)),
        },
    )
    _http2_min_sent_ping_interval_without_data: float = field(
        default=300,
        metadata={
            'validate': _optional(_chain(_of_type(int, float), _positive)),
        },
    )
    #: Sets inbound window size for a connection. HTTP/2 spec allows this value
    #: to be from 64 KiB to 2 GiB, 4 MiB is used by default
    http2_connection_window_size: int = field(
        default=_4MiB,
        metadata={
            'validate': _chain(_of_type(int), _range(_WMIN, _WMAX)),
        },
    )
    #: Sets inbound window size for a stream. HTTP/2 spec allows this value
    #: to be from 64 KiB to 2 GiB, 4 MiB is used by default
    http2_stream_window_size: int = field(
        default=_4MiB,
        metadata={
            'validate': _chain(_of_type(int), _range(_WMIN, _WMAX)),
        },
    )

    #: NOTE: This should be used for testing only. Overrides the hostname that
    #: the target server’s certificate will be matched against. By default, the
    #: value of the host argument is used.
    ssl_target_name_override: Optional[str] = field(
        default=None,
    )

    def __post_init__(self) -> None:
        _validate(self)

    def __for_server__(self) -> 'Configuration':
        return _with_defaults(self, 'server-default')

    def __for_client__(self) -> 'Configuration':
        return _with_defaults(self, 'client-default')

    def __for_test__(self) -> 'Configuration':
        return _with_defaults(self, 'test-default')
