# Copyright Modal Labs 2025
from ._billing import _workspace_billing_report
from ._utils.async_utils import synchronize_api

workspace_billing_report = synchronize_api(_workspace_billing_report)
