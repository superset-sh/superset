# Copyright Modal Labs 2022
r"""Modal intentionally keeps configurability to a minimum.

The main configuration options are the API tokens: the token id and the token secret.
These can be configured in two ways:

1. By running the `modal token set` command.
   This writes the tokens to `.modal.toml` file in your home directory.
2. By setting the environment variables `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`.
   This takes precedence over the previous method.

.modal.toml
---------------

The `.modal.toml` file is generally stored in your home directory.
It should look like this::

```toml
[default]
token_id = "ak-12345..."
token_secret = "as-12345..."
```

You can create this file manually, or you can run the `modal token set ...`
command (see below).

Setting tokens using the CLI
----------------------------

You can set a token by running the command::

```
modal token set \
  --token-id <token id> \
  --token-secret <token secret>
```

This will write the token id and secret to `.modal.toml`.

If the token id or secret is provided as the string `-` (a single dash),
then it will be read in a secret way from stdin instead.

Other configuration options
---------------------------

Other possible configuration options are:

* `loglevel` (in the .toml file) / `MODAL_LOGLEVEL` (as an env var).
  Defaults to `WARNING`. Set this to `DEBUG` to see internal messages.
* `logs_timeout` (in the .toml file) / `MODAL_LOGS_TIMEOUT` (as an env var).
  Defaults to 10.
  Number of seconds to wait for logs to drain when closing the session,
  before giving up.
* `max_throttle_wait` (in the .toml file) / `MODAL_MAX_THROTTLE_WAIT` (as an env var).
  Defaults to None (no limit).
  Maximum number of seconds to wait when requests are being throttled (i.e., due
  to rate limiting or other cases that can normally be resolved through backoff).
* `force_build` (in the .toml file) / `MODAL_FORCE_BUILD` (as an env var).
  Defaults to False.
  When set, ignores the Image cache and builds all Image layers. Note that this
  will break the cache for all images based on the rebuilt layers, so other images
  may rebuild on subsequent runs / deploys even if the config is reverted.
* `ignore_cache` (in the .toml file) / `MODAL_IGNORE_CACHE` (as an env var).
  Defaults to False.
  When set, ignores the Image cache and builds all Image layers. Unlike `force_build`,
  this will not overwrite the cache for other images that have the same recipe.
  Subsequent runs that do not use this option will pull the *previous* Image from
  the cache, if one exists. It can be useful for testing an App's robustness to
  Image rebuilds without clobbering Images used by other Apps.
* `traceback` (in the .toml file) / `MODAL_TRACEBACK` (as an env var).
  Defaults to False. Enables printing full tracebacks on unexpected CLI
  errors, which can be useful for debugging client issues.
* `log_pattern` (in the .toml file) / `MODAL_LOG_PATTERN` (as an env var).
  Defaults to `"[modal-client] %(asctime)s %(message)s"`
  The log formatting pattern that will be used by the modal client itself.
  See https://docs.python.org/3/library/logging.html#logrecord-attributes for available
  log attributes.
* `dev_suffix` (in the .toml file) / `MODAL_DEV_SUFFIX` (as an env var).
  Overrides the default `-dev` suffix added to URLs generated for web endpoints
  when the App is ephemeral (i.e., created via `modal serve`). Must be a short
  alphanumeric string.

Meta-configuration
------------------

Some "meta-options" are set using environment variables only:

* `MODAL_CONFIG_PATH` lets you override the location of the .toml file,
  by default `~/.modal.toml`.
* `MODAL_PROFILE` lets you use multiple sections in the .toml file
  and switch between them. It defaults to "default".
"""

import logging
import os
import re
import typing
import warnings
from typing import Any, Callable, Optional

from google.protobuf.empty_pb2 import Empty

from modal_proto import api_pb2

from ._utils.logger import configure_logger
from .exception import InvalidError, NotFoundError

DEFAULT_SERVER_URL = "https://api.modal.com"


# Locate config file and read it

user_config_path: str = os.environ.get("MODAL_CONFIG_PATH") or os.path.expanduser("~/.modal.toml")


def _is_remote() -> bool:
    # We want to prevent read/write on a modal config file in the container
    # environment, both because that doesn't make sense and might cause weird
    # behavior, and because we want to keep the `toml` dependency out of the
    # container runtime.
    return os.environ.get("MODAL_IS_REMOTE") == "1"


def _read_user_config():
    config_data = {}
    if not _is_remote() and os.path.exists(user_config_path):
        # Defer toml import so we don't need it in the container runtime environment
        import toml

        try:
            with open(user_config_path) as f:
                config_data = toml.load(f)
        except Exception as exc:
            config_problem = str(exc)
        else:
            if not all(isinstance(e, dict) for e in config_data.values()):
                config_problem = "TOML file must contain table sections for each profile."
            else:
                config_problem = ""
        if config_problem:
            message = f"\nError when reading the modal configuration from `{user_config_path}`.\n\n{config_problem}"
            raise InvalidError(message)
    return config_data


_user_config = _read_user_config()


async def _lookup_workspace(server_url: str, token_id: str, token_secret: str) -> api_pb2.WorkspaceNameLookupResponse:
    from .client import _Client

    credentials = (token_id, token_secret)
    async with _Client(server_url, api_pb2.CLIENT_TYPE_CLIENT, credentials) as client:
        return await client.stub.WorkspaceNameLookup(Empty(), retry=None, timeout=3)


def config_profiles():
    """List the available modal profiles in the .modal.toml file."""
    return _user_config.keys()


def _config_active_profile() -> str:
    for key, values in _user_config.items():
        if values.get("active", False) is True:
            return key
    else:
        return "default"


def config_set_active_profile(profile: str) -> None:
    """Set the user's active modal profile by writing it to the `.modal.toml` file."""
    if profile not in _user_config:
        raise NotFoundError(f"No profile named '{profile}' found in {user_config_path}")

    for profile_data in _user_config.values():
        profile_data.pop("active", None)

    _user_config[profile]["active"] = True  # type: ignore
    _write_user_config(_user_config)


def _check_config() -> None:
    num_profiles = len(_user_config)
    num_active = sum(v.get("active", False) for v in _user_config.values())
    if num_active > 1:
        raise InvalidError(
            "More than one Modal profile is active. "
            "Please fix with `modal profile activate` or by editing your Modal config file "
            f"({user_config_path})."
        )
    elif num_profiles > 1 and num_active == 0 and _profile == "default":
        # TODO: We should get rid of the `_profile = "default"` concept entirely now
        raise InvalidError(
            "No Modal profile is active.\n\n"
            "Please fix by running `modal profile activate` or by editing your Modal config file "
            f"({user_config_path})."
        )


_profile = os.environ.get("MODAL_PROFILE") or _config_active_profile()

# Define settings


def _to_boolean(x: object) -> bool:
    return str(x).lower() not in {"", "0", "false"}


def _check_value(options: list[str]) -> Callable[[str], str]:
    def checker(x: str) -> str:
        if x not in options:
            raise ValueError(f"Must be one of {options}.")
        return x

    return checker


def _enforce_suffix_rules(x: str) -> str:
    if x and not re.match(r"^[a-zA-Z0-9]{1,8}$", x):
        raise ValueError("Suffix must be an alphanumeric string of no more than 8 characters.")
    return x


class _Setting(typing.NamedTuple):
    default: typing.Any = None
    transform: typing.Callable[[str], typing.Any] = lambda x: x  # noqa: E731


_SETTINGS = {
    "loglevel": _Setting("WARNING", lambda s: s.upper()),
    "log_format": _Setting("STRING", lambda s: s.upper()),
    "log_pattern": _Setting(),  # optional override of the formatting pattern
    "server_url": _Setting(DEFAULT_SERVER_URL),
    "token_id": _Setting(),
    "token_secret": _Setting(),
    "task_id": _Setting(),
    "serve_timeout": _Setting(transform=float),
    "sync_entrypoint": _Setting(),
    "logs_timeout": _Setting(10, float),
    "image_id": _Setting(),
    "heartbeat_interval": _Setting(15, float),
    "function_runtime": _Setting(),
    "function_runtime_debug": _Setting(False, transform=_to_boolean),  # For internal debugging use.
    "runtime_perf_record": _Setting(False, transform=_to_boolean),  # For internal debugging use.
    "environment": _Setting(),
    "default_cloud": _Setting(None, transform=lambda x: x if x else None),
    "worker_id": _Setting(),  # For internal debugging use.
    "restore_state_path": _Setting("/__modal/restore-state.json"),
    "force_build": _Setting(False, transform=_to_boolean),
    "ignore_cache": _Setting(False, transform=_to_boolean),
    "traceback": _Setting(False, transform=_to_boolean),
    "image_builder_version": _Setting(),
    "strict_parameters": _Setting(False, transform=_to_boolean),  # For internal/experimental use
    "snapshot_debug": _Setting(False, transform=_to_boolean),
    "cuda_checkpoint_path": _Setting("/__modal/.bin/cuda-checkpoint"),  # Used for snapshotting GPU memory.
    "build_validation": _Setting("error", transform=_check_value(["error", "warn", "ignore"])),
    # Payload format for function inputs/outputs: 'pickle' (default) or 'cbor'
    "payload_format": _Setting(
        "pickle",
        transform=lambda s: _check_value(["pickle", "cbor"])(s.lower()),
    ),
    "dev_suffix": _Setting("", transform=_enforce_suffix_rules),
    "max_throttle_wait": _Setting(None, transform=lambda x: int(x) if x else None),
    "async_warnings": _Setting(False, transform=_to_boolean),  # Feature flag for async API warnings
}


class Config:
    """Singleton that holds configuration used by Modal internally."""

    def __init__(self):
        pass

    def get(self, key, profile=None, use_env=True):
        """Looks up a configuration value.

        Will check (in decreasing order of priority):
        1. Any environment variable of the form MODAL_FOO_BAR (when use_env is True)
        2. Settings in the user's .toml configuration file
        3. The default value of the setting
        """
        if profile is None:
            profile = _profile
        s = _SETTINGS[key]
        env_var_key = "MODAL_" + key.upper()

        def transform(val: str) -> Any:
            try:
                return s.transform(val)
            except Exception as e:
                raise InvalidError(f"Invalid value for {key} config ({val!r}): {e}")

        if use_env and env_var_key in os.environ:
            return transform(os.environ[env_var_key])
        elif profile in _user_config and key in _user_config[profile]:
            return transform(_user_config[profile][key])
        else:
            return s.default

    def override_locally(self, key: str, value: str):
        # Override setting in this process by overriding environment variable for the setting
        #
        # Does NOT write back to settings file etc.
        try:
            self.get(key)
            os.environ["MODAL_" + key.upper()] = value
        except KeyError:
            # Override env vars not available in config, e.g. NVIDIA_VISIBLE_DEVICES.
            # This is used for restoring env vars from a memory snapshot.
            os.environ[key.upper()] = value

    def __getitem__(self, key):
        return self.get(key)

    def __repr__(self):
        return repr(self.to_dict())

    def to_dict(self):
        return {key: self.get(key) for key in sorted(_SETTINGS)}


config = Config()

# Logging

logger = logging.getLogger("modal-client")
configure_logger(logger, config["loglevel"], config["log_format"])

# Utils to write config


def _store_user_config(
    new_settings: dict[str, Any],
    profile: Optional[str] = None,
    active_profile: Optional[str] = None,
):
    """Internal method, used by the CLI to set tokens."""
    if profile is None:
        profile = _profile
    user_config = _read_user_config()
    user_config.setdefault(profile, {}).update(**new_settings)
    if active_profile is not None:
        for prof_name, prof_config in user_config.items():
            if prof_name == active_profile:
                prof_config["active"] = True
            else:
                prof_config.pop("active", None)
    _write_user_config(user_config)


def _write_user_config(user_config):
    if _is_remote():
        raise InvalidError("Can't update config file in remote environment.")

    # Defer toml import so we don't need it in the container runtime environment
    import toml

    with open(user_config_path, "w") as f:
        toml.dump(user_config, f)


# Make sure all deprecation warnings are shown
# See https://docs.python.org/3/library/warnings.html#overriding-the-default-filter
warnings.filterwarnings(
    "default",
    category=DeprecationWarning,
    module="modal",
)
