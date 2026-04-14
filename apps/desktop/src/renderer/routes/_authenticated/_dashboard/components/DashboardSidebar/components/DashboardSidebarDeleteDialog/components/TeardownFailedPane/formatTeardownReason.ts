import type { TeardownFailureCause } from "@superset/host-service";
import { TEARDOWN_TIMEOUT_MS } from "@superset/shared/constants";

/** Human-readable one-liner for the dialog title when teardown fails. */
export function formatTeardownReason(cause: TeardownFailureCause): string {
	if (cause.timedOut) {
		return `Teardown timed out after ${Math.round(TEARDOWN_TIMEOUT_MS / 1000)}s`;
	}
	if (cause.exitCode != null) {
		return `Teardown exited with code ${cause.exitCode}`;
	}
	return "Teardown failed to start";
}
