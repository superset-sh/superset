# Copyright Modal Labs 2025

"""This module provides Jupyter/IPython extensions for Modal.

Use in a notebook with `%load_ext modal.experimental.ipython`.
"""

from IPython.core.magic import Magics, line_magic, magics_class

from ..cls import Cls
from ..exception import NotFoundError
from ..functions import Function


@magics_class
class ModalMagics(Magics):
    @line_magic
    def modal(self, line):
        """Lookup a deployed Modal Function or Class.

        **Example:**

        ```python notest
        %modal from my-app import my_function, MyClass as Foo

        # Now you can call my_function() and Foo from your notebook.
        my_function.remote()
        Foo().my_method.remote()
        ```
        """
        line = line.strip()
        if not line.startswith("from "):
            print("Invalid syntax. Use: %modal from [env/]<app> import <function|Class>[, <function|Class> [as alias]]")
            return

        # Remove the initial "from "
        line_without_from = line[5:]
        env_app_part, sep, import_part = line_without_from.partition(" import ")
        if not sep:
            print("Invalid syntax. Missing 'import' keyword.")
            return

        # Parse environment and app from "[env/]app"
        environment: str | None
        if "/" not in env_app_part:
            environment, app = None, env_app_part
        else:
            environment, app = env_app_part.split("/", 1)

        # Parse the import items (multiple imports separated by commas)
        import_items = [item.strip() for item in import_part.split(",")]
        for item in import_items:
            if not item:
                continue
            parts = item.split()
            # Expect either "Model" or "Model as alias"
            if len(parts) == 0:
                continue
            model_name = parts[0]
            alias = model_name
            if len(parts) == 3 and parts[1] == "as":
                alias = parts[2]
            elif len(parts) > 1:
                print(f"Invalid syntax in import item: {item!r}. Expected format: <function|Class> [as alias]")
                return

            # Try to load using Function; if not found, fallback to Cls
            try:
                obj: Function | Cls = Function.from_name(app, model_name, environment_name=environment)
                obj.hydrate()
            except NotFoundError:
                obj = Cls.from_name(app, model_name, environment_name=environment)
                obj.hydrate()

            # Set the loaded object in the notebook namespace
            self.shell.user_ns[alias] = obj  # type: ignore
            if environment:
                print(f"Loaded {alias!r} from environment {environment!r} and app {app!r}.")
            else:
                print(f"Loaded {alias!r} from app {app!r}.")


def load_ipython_extension(ipython):
    ipython.register_magics(ModalMagics)
