# Copyright Modal Labs 2022
from modal_proto import api_pb2


class Schedule:
    """Schedules represent a time frame to repeatedly run a Modal function."""

    def __init__(self, proto_message):
        self.proto_message = proto_message


class Cron(Schedule):
    """Cron jobs are a type of schedule, specified using the
    [Unix cron tab](https://crontab.guru/) syntax.

    The alternative schedule type is the [`modal.Period`](https://modal.com/docs/reference/modal.Period).

    **Usage**

    ```python
    import modal
    app = modal.App()


    @app.function(schedule=modal.Cron("* * * * *"))
    def f():
        print("This function will run every minute")
    ```

    We can specify different schedules with cron strings, for example:

    ```python
    modal.Cron("5 4 * * *")  # run at 4:05am UTC every night
    modal.Cron("0 9 * * 4")  # runs every Thursday at 9am UTC
    ```

    We can also optionally specify a timezone, for example:

    ```python
    # Run daily at 6am New York time, regardless of whether daylight saving
    # is in effect (i.e. at 11am UTC in the winter, and 10am UTC in the summer):
    modal.Cron("0 6 * * *", timezone="America/New_York")
    ```

    If no timezone is specified, the default is UTC.
    """

    def __init__(
        self,
        cron_string: str,
        timezone: str = "UTC",
    ) -> None:
        """Construct a schedule that runs according to a cron expression string."""
        cron = api_pb2.Schedule.Cron(cron_string=cron_string, timezone=timezone)
        super().__init__(api_pb2.Schedule(cron=cron))


class Period(Schedule):
    """Create a schedule that runs every given time interval.

    **Usage**

    ```python
    import modal
    app = modal.App()

    @app.function(schedule=modal.Period(days=1))
    def f():
        print("This function will run every day")

    modal.Period(hours=4)          # runs every 4 hours
    modal.Period(minutes=15)       # runs every 15 minutes
    modal.Period(seconds=math.pi)  # runs every 3.141592653589793 seconds
    ```

    Only `seconds` can be a float. All other arguments are integers.

    Note that `days=1` will trigger the function the same time every day.
    This does not have the same behavior as `seconds=84000` since days have
    different lengths due to daylight savings and leap seconds. Similarly,
    using `months=1` will trigger the function on the same day each month.

    This behaves similar to the
    [dateutil](https://dateutil.readthedocs.io/en/latest/relativedelta.html)
    package.
    """

    def __init__(
        self,
        *,
        years: int = 0,
        months: int = 0,
        weeks: int = 0,
        days: int = 0,
        hours: int = 0,
        minutes: int = 0,
        seconds: float = 0,
    ) -> None:
        period = api_pb2.Schedule.Period(
            years=years,
            months=months,
            weeks=weeks,
            days=days,
            hours=hours,
            minutes=minutes,
            seconds=seconds,
        )
        super().__init__(api_pb2.Schedule(period=period))
