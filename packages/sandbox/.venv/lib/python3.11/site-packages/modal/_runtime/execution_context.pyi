import collections.abc
import contextvars
import typing
import typing_extensions

def is_local() -> bool:
    """Returns if we are currently on the machine launching/deploying a Modal app

    Returns `True` when executed locally on the user's machine.
    Returns `False` when executed from a Modal container in the cloud.
    """
    ...

async def _interact() -> None:
    """Enable interactivity with user input inside a Modal container.

    See the [interactivity guide](https://modal.com/docs/guide/developing-debugging#interactivity)
    for more information on how to use this function.
    """
    ...

class __interact_spec(typing_extensions.Protocol):
    def __call__(self, /) -> None:
        """Enable interactivity with user input inside a Modal container.

        See the [interactivity guide](https://modal.com/docs/guide/developing-debugging#interactivity)
        for more information on how to use this function.
        """
        ...

    async def aio(self, /) -> None:
        """Enable interactivity with user input inside a Modal container.

        See the [interactivity guide](https://modal.com/docs/guide/developing-debugging#interactivity)
        for more information on how to use this function.
        """
        ...

interact: __interact_spec

def current_input_id() -> typing.Optional[str]:
    """Returns the input ID for the current input.

    Can only be called from Modal function (i.e. in a container context).

    ```python
    from modal import current_input_id

    @app.function()
    def process_stuff():
        print(f"Starting to process {current_input_id()}")
    ```
    """
    ...

def current_function_call_id() -> typing.Optional[str]:
    """Returns the function call ID for the current input.

    Can only be called from Modal function (i.e. in a container context).

    ```python
    from modal import current_function_call_id

    @app.function()
    def process_stuff():
        print(f"Starting to process input from {current_function_call_id()}")
    ```
    """
    ...

def current_attempt_token() -> typing.Optional[str]: ...
def _set_current_context_ids(
    input_ids: list[str], function_call_ids: list[str], attempt_tokens: list[str]
) -> collections.abc.Callable[[], None]: ...
def _import_context(): ...

_current_input_id: contextvars.ContextVar

_current_function_call_id: contextvars.ContextVar

_current_attempt_token: contextvars.ContextVar
