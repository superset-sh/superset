# Copyright Modal Labs 2024
"""Interface to Modal's OutputManager functionality.

These functions live here so that Modal library code can import them without
transitively importing Rich, as we do in global scope in _output.py. This allows
us to avoid importing Rich for client code that runs in the container environment.

"""

import contextlib
from collections.abc import Generator
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from ._output import OutputManager


OUTPUT_ENABLED = False


@contextlib.contextmanager
def enable_output(show_progress: bool = True, show_timestamps: bool = False) -> Generator[None, None, None]:
    """Context manager that enable output when using the Python SDK.

    This will print to stdout and stderr things such as
    1. Logs from running functions
    2. Status of creating objects
    3. Map progress

    Example:
    ```python
    app = modal.App()
    with modal.enable_output():
        with app.run():
            ...
    ```
    """
    from ._output import OutputManager

    # Toggle the output flag from within this function so that we can
    # call _get_output_manager from within the library and only import
    # the _output module if output is explicitly enabled. That prevents
    # us from trying to import rich inside a container environment where
    # it might not be installed. This is sort of hacky and I would prefer
    # a more thorough refactor where the OutputManager is fully useable
    # without rich installed, but that's a larger project.
    global OUTPUT_ENABLED

    try:
        with OutputManager.enable_output(show_progress, show_timestamps=show_timestamps):
            OUTPUT_ENABLED = True
            yield
    finally:
        OUTPUT_ENABLED = False


def _get_output_manager() -> Optional["OutputManager"]:
    """Interface to the OutputManager that returns None when output is not enabled."""
    if OUTPUT_ENABLED:
        from ._output import OutputManager

        return OutputManager.get()
    else:
        return None
