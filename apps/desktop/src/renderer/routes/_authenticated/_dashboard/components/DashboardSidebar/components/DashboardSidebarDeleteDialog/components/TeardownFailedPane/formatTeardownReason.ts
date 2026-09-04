import { msg } from "@lingui/core/macro";
import type { TeardownFailureCause } from "@superset/host-service";
import { i18n } from "@superset/i18n";
import { TEARDOWN_TIMEOUT_MS } from "@superset/shared/constants";

/** Human-readable one-liner for the dialog title when teardown fails. */
export function formatTeardownReason(cause: TeardownFailureCause): string {
	if (cause.timedOut) {
		return i18n._({
			...msg({
				message: "Teardown timed out after {seconds}s",
			}),
			values: { seconds: Math.round(TEARDOWN_TIMEOUT_MS / 1000) },
		});
	}
	if (cause.exitCode != null) {
		return i18n._({
			...msg({
				message: "Teardown exited with code {exitCode}",
			}),
			values: { exitCode: cause.exitCode },
		});
	}
	if (cause.signal != null) {
		return i18n._({
			...msg({
				message: "Teardown terminated by signal {signal}",
			}),
			values: { signal: cause.signal },
		});
	}
	return i18n._(
		msg({
			message: "Teardown failed to start",
		}),
	);
}
