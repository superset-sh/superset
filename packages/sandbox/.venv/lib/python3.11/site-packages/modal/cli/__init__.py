# Copyright Modal Labs 2022
"""
The `modal.cli` package contains the Python implementations for Modal's CLI.

The functions defined in this package are intended to be called via the CLI,
not from Python code. No backwards compatibility guarantees are made with
respect to Python calling patterns (e.g., the order of parameters corresponding
to CLI options may change in the Python signature without warning).

Any utility or helper functions defined in this package are intended for use by
the CLI commands and are not for external consumption; they should be
considered private even if they do not use a private naming convention.

Over time, we aspire to support feature parity between the CLI and the public
Python API, although this remains a work in progress.
"""
