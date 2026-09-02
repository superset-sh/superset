import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
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

/**
 * What the caller was trying to do, as a key rather than a sentence fragment:
 * the fragment lands inside a full catalog sentence, so it has to be
 * translatable on its own and picked from a closed set.
 */
export type HostServiceAction =
	| "addAgent"
	| "cloneRepository"
	| "createProject"
	| "createWorkspace"
	| "importFolder"
	| "importProject"
	| "loadAgentSettings"
	| "openTaskInWorkspace"
	| "removeAgent"
	| "removePrLink"
	| "renameBranch"
	| "reorderAgents"
	| "resetAgents"
	| "resolveWorkspacePath"
	| "restoreAgentDefaults"
	| "runIssuesInWorkspaces"
	| "runTasksInWorkspaces"
	| "saveAgent"
	| "saveAgentCommand"
	| "updateBranchPrefix";

const ACTION_MESSAGES: Record<HostServiceAction, MessageDescriptor> = {
	addAgent: msg({
		id: "hostServiceUnavailable.action.addAgent",
		message: "add an agent",
	}),
	cloneRepository: msg({
		id: "hostServiceUnavailable.action.cloneRepository",
		message: "clone the repository",
	}),
	createProject: msg({
		id: "hostServiceUnavailable.action.createProject",
		message: "create the project",
	}),
	createWorkspace: msg({
		id: "hostServiceUnavailable.action.createWorkspace",
		message: "create the workspace",
	}),
	importFolder: msg({
		id: "hostServiceUnavailable.action.importFolder",
		message: "import a folder",
	}),
	importProject: msg({
		id: "hostServiceUnavailable.action.importProject",
		message: "import the project",
	}),
	loadAgentSettings: msg({
		id: "hostServiceUnavailable.action.loadAgentSettings",
		message: "load agent settings",
	}),
	openTaskInWorkspace: msg({
		id: "hostServiceUnavailable.action.openTaskInWorkspace",
		message: "open the task in a workspace",
	}),
	removeAgent: msg({
		id: "hostServiceUnavailable.action.removeAgent",
		message: "remove the agent",
	}),
	removePrLink: msg({
		id: "hostServiceUnavailable.action.removePrLink",
		message: "remove the PR link",
	}),
	renameBranch: msg({
		id: "hostServiceUnavailable.action.renameBranch",
		message: "rename the branch",
	}),
	reorderAgents: msg({
		id: "hostServiceUnavailable.action.reorderAgents",
		message: "reorder agents",
	}),
	resetAgents: msg({
		id: "hostServiceUnavailable.action.resetAgents",
		message: "reset agents",
	}),
	resolveWorkspacePath: msg({
		id: "hostServiceUnavailable.action.resolveWorkspacePath",
		message: "resolve the workspace path",
	}),
	restoreAgentDefaults: msg({
		id: "hostServiceUnavailable.action.restoreAgentDefaults",
		message: "restore the agent defaults",
	}),
	runIssuesInWorkspaces: msg({
		id: "hostServiceUnavailable.action.runIssuesInWorkspaces",
		message: "run issues in workspaces",
	}),
	runTasksInWorkspaces: msg({
		id: "hostServiceUnavailable.action.runTasksInWorkspaces",
		message: "run tasks in workspaces",
	}),
	saveAgent: msg({
		id: "hostServiceUnavailable.action.saveAgent",
		message: "save the agent",
	}),
	saveAgentCommand: msg({
		id: "hostServiceUnavailable.action.saveAgentCommand",
		message: "save the agent command",
	}),
	updateBranchPrefix: msg({
		id: "hostServiceUnavailable.action.updateBranchPrefix",
		message: "update the branch prefix",
	}),
};

interface HostServiceUnavailableMessageOptions {
	action?: HostServiceAction;
}

function shortId(id: string): string {
	return id.length > 8 ? id.slice(0, 8) : id;
}

function formatOrganization(context: HostServiceUnavailableContext): string {
	if (context.activeOrganizationName) {
		return `"${context.activeOrganizationName}"`;
	}
	if (context.activeOrganizationId) {
		return i18n._({
			id: "hostServiceUnavailable.organizationById",
			message: "organization {id}",
			values: { id: shortId(context.activeOrganizationId) },
		});
	}
	return i18n._({
		id: "hostServiceUnavailable.activeOrganization",
		message: "the active organization",
	});
}

function formatDevice(context: HostServiceUnavailableContext): string {
	return context.machineId
		? i18n._({
				id: "hostServiceUnavailable.deviceWithId",
				message: "this device ({id})",
				values: { id: shortId(context.machineId) },
			})
		: i18n._({
				id: "hostServiceUnavailable.device",
				message: "this device",
			});
}

function statusLabel(status: HostServiceAvailabilityStatus): string {
	switch (status) {
		case "starting":
			return i18n._({
				id: "hostServiceUnavailable.status.starting",
				message: "starting",
			});
		case "running":
			return i18n._({
				id: "hostServiceUnavailable.status.running",
				message: "running",
			});
		case "stopped":
			return i18n._({
				id: "hostServiceUnavailable.status.stopped",
				message: "stopped",
			});
		case "unknown":
			return i18n._({
				id: "hostServiceUnavailable.status.unknown",
				message: "unknown",
			});
	}
}

function getRecoveryText(status: HostServiceAvailabilityStatus): string {
	switch (status) {
		case "starting":
			return i18n._({
				id: "hostServiceUnavailable.recovery.starting",
				message: "Retry in a few seconds.",
			});
		case "stopped":
			return i18n._({
				id: "hostServiceUnavailable.recovery.stopped",
				message:
					"Use the Superset tray menu > Host Service > Restart, then retry.",
			});
		case "running":
			return i18n._({
				id: "hostServiceUnavailable.recovery.running",
				message: "Retry after the connection refreshes.",
			});
		case "unknown":
			return i18n._({
				id: "hostServiceUnavailable.recovery.unknown",
				message: "Retry in a few seconds; if it persists, restart Superset.",
			});
	}
}

export function getHostServiceUnavailableMessage(
	context: HostServiceUnavailableContext,
	options: HostServiceUnavailableMessageOptions = {},
): string {
	const action = options.action
		? i18n._(ACTION_MESSAGES[options.action])
		: null;

	if (!context.activeOrganizationId) {
		return action
			? i18n._({
					id: "hostServiceUnavailable.noOrganization.withAction",
					message:
						"Cannot {action}: no active organization is selected. Select an organization or sign in again.",
					values: { action },
				})
			: i18n._({
					id: "hostServiceUnavailable.noOrganization",
					message:
						"No active organization is selected. Select an organization or sign in again.",
				});
	}

	const status = context.hostServiceStatus ?? "unknown";
	const organization = formatOrganization(context);
	const device = formatDevice(context);
	const statusText = statusLabel(status);
	const recovery = getRecoveryText(status);

	// The extractor maps placeholders by reading the `values` object literally,
	// so each key is spelled out here — a spread or a shared identifier makes
	// the message unextractable.
	return action
		? i18n._({
				id: "hostServiceUnavailable.message.withAction",
				message:
					"Cannot {action}: the local host service is unavailable for {organization} on {device}. Status: {status}. {recovery}",
				values: { action, organization, device, status: statusText, recovery },
			})
		: i18n._({
				id: "hostServiceUnavailable.message",
				message:
					"The local host service is unavailable for {organization} on {device}. Status: {status}. {recovery}",
				values: { organization, device, status: statusText, recovery },
			});
}

export function showHostServiceUnavailableToast(
	context: HostServiceUnavailableContext,
	options: HostServiceUnavailableMessageOptions = {},
): void {
	toast.error(
		i18n._({
			id: "hostServiceUnavailable.toastTitle",
			message: "Host service unavailable",
		}),
		{
			description: getHostServiceUnavailableMessage(context, options),
		},
	);
}
