# Copyright Modal Labs 2022
import sys


def is_interactive_ipython():
    """
    Detect if we're running in an interactive IPython session.

    Returns True for IPython shells (including Jupyter notebooks), False otherwise.
    """
    try:
        # Check if IPython is available and get the current instance
        ipython = sys.modules.get("IPython")
        if ipython is None:
            return False

        # Try to get the active IPython instance
        shell = ipython.get_ipython()
        return shell is not None
    except Exception:
        return False
