# Copyright Modal Labs 2022
import logging
import os


def configure_logger(logger: logging.Logger, log_level: str, log_format: str):
    from modal.config import config

    ch = logging.StreamHandler()
    log_level_numeric = logging.getLevelName(log_level.upper())
    logger.setLevel(log_level_numeric)
    ch.setLevel(log_level_numeric)
    datefmt = "%Y-%m-%dT%H:%M:%S%z"
    if log_format.upper() == "JSON":
        # This is primarily for modal internal use.
        # pythonjsonlogger is already installed in the environment.
        from pythonjsonlogger import jsonlogger

        if not (log_format_pattern := config.get("log_pattern")):
            log_format_pattern = (
                "%(asctime)s %(levelname)s [%(name)s] [%(filename)s:%(lineno)d] "
                "[dd.service=%(dd.service)s dd.env=%(dd.env)s dd.version=%(dd.version)s dd.trace_id=%(dd.trace_id)s "
                "dd.span_id=%(dd.span_id)s] "
                "- %(message)s"
            )

        json_formatter = jsonlogger.JsonFormatter(
            fmt=log_format_pattern,
            datefmt=datefmt,
        )
        ch.setFormatter(json_formatter)
    else:
        if not (log_format_pattern := config.get("log_pattern")):
            # TODO: use `%(name)s` instead of `modal-client` as soon as we unify the loggers we use
            log_format_pattern = "[modal-client] %(asctime)s %(message)s"

        ch.setFormatter(logging.Formatter(log_format_pattern, datefmt=datefmt))

    logger.addHandler(ch)


# TODO: remove this distinct logger in favor of the one in modal.config?
log_level = os.environ.get("MODAL_LOGLEVEL", "WARNING")
log_format = os.environ.get("MODAL_LOG_FORMAT", "STRING")

logger = logging.getLogger("modal-utils")
configure_logger(logger, log_level, log_format)
