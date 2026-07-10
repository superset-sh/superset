import { toast } from "@superset/ui/sonner";

export type HostServiceAvailabilityStatus =
	| "starting"
	| "running"
	| "stopped"
	| "unknown";

export interface HostServiceUnavailableContext {
	activeOrganizationId?: string | null;
	activeOrganizationName?: string | null;
	hostServiceStatus?: HostServiceAvailabilityStatus | null;
	machineId?: string | null;
}

interface HostServiceUnavailableMessageOptions {
	action?: string;
}

function shortId(id: string): string {
	return id.length > 8 ? id.slice(0, 8) : id;
}

function formatOrganization(context: HostServiceUnavailableContext): string {
	if (context.activeOrganizationName) {
		return `"${context.activeOrganizationName}"`;
	}
	if (context.activeOrganizationId) {
		return `organization ${shortId(context.activeOrganizationId)}`;
	}
	return "the active organization";
}

function formatDevice(context: HostServiceUnavailableContext): string {
	return context.machineId
		? `this device (${shortId(context.machineId)})`
		: "this device";
}

function getRecoveryText(status: HostServiceAvailabilityStatus): string {
	switch (status) {
		case "starting":
			return "Retry in a few seconds.";
		case "stopped":
			return "Use the Superset tray menu > Host Service > Restart, then retry.";
		case "running":
			return "Retry after the connection refreshes.";
		case "unknown":
			return "Retry in a few seconds; if it persists, restart Superset.";
	}
}

export function getHostServiceUnavailableMessage(
	context: HostServiceUnavailableContext,
	options: HostServiceUnavailableMessageOptions = {},
): string {
	const prefix = options.action ? `Cannot ${options.action}: ` : "";

	if (!context.activeOrganizationId) {
		return `${prefix}no active organization is selected. Select an organization or sign in again.`;
	}

	const status = context.hostServiceStatus ?? "unknown";
	const organization = formatOrganization(context);
	const device = formatDevice(context);

	return `${prefix}the local host service is unavailable for ${organization} on ${device}. Status: ${status}. ${getRecoveryText(status)}`;
}

export function showHostServiceUnavailableToast(
	context: HostServiceUnavailableContext,
	options: HostServiceUnavailableMessageOptions = {},
): void {
	toast.error("Host service unavailable", {
		description: getHostServiceUnavailableMessage(context, options),
	});
}
