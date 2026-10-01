import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { AutomationRunErrorCode } from "@superset/db/enums";
import { i18n } from "@superset/i18n";

const HELP: Record<AutomationRunErrorCode, MessageDescriptor> = {
	host_offline: msg({
		message:
			"The host isn't connected to the Superset relay. If it's this device, turn on \"Allow remote access to this device via relay\" in Settings > Remote Access, then try again.",
	}),
	agent_not_found: msg({
		message:
			"The agent this automation was set to run no longer exists on its host — the host's agents may have been reset or removed. Re-select an agent in the automation's settings.",
	}),
	workspace_not_found: msg({
		message:
			"The workspace this automation is pinned to no longer exists on its host. Pin a different one in the automation's settings.",
	}),
	cloud_not_ready: msg({
		message:
			"The cloud workspace should have started but didn't answer in time. The next run tries again.",
	}),
	cloud_access_denied: msg({
		message:
			"The automation's owner can't use cloud workspaces in this organization anymore. Ask them to check their access, or run the automation on a device.",
	}),
	cloud_environment_unusable: msg({
		message:
			"The environment this automation starts cloud workspaces from was archived or has no repositories. Pick another environment in the automation's settings.",
	}),
	no_instructions: msg({
		message:
			"This automation has no instructions yet. Write a prompt in its settings before running it.",
	}),
};

/** Guidance for a failure, or null when we have nothing to add to `error`. */
export function runErrorHelp(
	code: string | null | undefined,
): MessageDescriptor | null {
	if (!code) return null;
	return HELP[code as AutomationRunErrorCode] ?? null;
}

/**
 * The dispatch code carried by a thrown tRPC error, for the live "run now"
 * path — a stored run has the column instead. Both replaced matching on the
 * English message, which the server pinned the wording of to keep working.
 */
export function dispatchErrorCode(error: unknown): string | null {
	const data = (error as { data?: unknown } | null | undefined)?.data as
		| { automationErrorCode?: unknown }
		| null
		| undefined;
	return typeof data?.automationErrorCode === "string"
		? data.automationErrorCode
		: null;
}

/**
 * How a failed run reads wherever it is shown. Leads with the plain-language
 * fix and keeps the raw host error for bug reports; both run lists call this
 * so the same run never reads two ways.
 */
export function describeRunError(run: {
	error?: string | null;
	errorCode?: string | null;
}): string {
	const error = run.error ?? "";
	const help = runErrorHelp(run.errorCode);
	return help ? `${i18n._(help)}\n\n(${error})` : error;
}
