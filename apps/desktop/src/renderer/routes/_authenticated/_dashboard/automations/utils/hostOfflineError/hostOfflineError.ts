import { msg } from "@lingui/core/macro";

// Both strings come from dispatchAutomation's skipped_offline path: "target
// host offline" for a pinned host, "no host available" for auto-routed
// automations when no host of the owner's is relay-connected.
const HOST_OFFLINE_ERRORS = ["target host offline", "no host available"];

export const HOST_OFFLINE_HELP = msg({
	message:
		"The host isn't connected to the Superset relay. If it's this device, turn on \"Allow remote access to this device via relay\" in Settings > Remote Access, then try again.",
});

export function isHostOfflineError(error: string | null | undefined): boolean {
	return !!error && HOST_OFFLINE_ERRORS.some((e) => error.includes(e));
}
