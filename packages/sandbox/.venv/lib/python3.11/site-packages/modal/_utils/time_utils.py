# Copyright Modal Labs 2025
from datetime import datetime, tzinfo
from typing import Optional, Union


def locale_tz() -> tzinfo:
    return datetime.now().astimezone().tzinfo


def as_timestamp(arg: Optional[Union[datetime, str]]) -> float:
    """Coerce a user-provided argument to a timestamp.

    An argument provided without timezone information will be treated as local time.

    When the argument is null, returns the current time.
    """
    if arg is None:
        dt = datetime.now().astimezone()
    elif isinstance(arg, str):
        dt = datetime.fromisoformat(arg)
    elif isinstance(arg, datetime):
        dt = arg
    else:
        raise TypeError(f"Invalid argument: {arg}")

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=locale_tz())
    return dt.timestamp()


def timestamp_to_localized_dt(ts: float) -> datetime:
    return datetime.fromtimestamp(ts, tz=locale_tz())


def timestamp_to_localized_str(ts: float, isotz: bool = True) -> Optional[str]:
    if ts > 0:
        dt = timestamp_to_localized_dt(ts)
        if isotz:
            return dt.isoformat(sep=" ", timespec="seconds")
        else:
            return f"{dt:%Y-%m-%d %H:%M %Z}"
    else:
        return None
