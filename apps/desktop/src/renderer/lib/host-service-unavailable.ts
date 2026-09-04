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
		message: "add an agent",
	}),
	cloneRepository: msg({
		message: "clone the repository",
	}),
	createProject: msg({
		message: "create the project",
	}),
	createWorkspace: msg({
		message: "create the workspace",
	}),
	importFolder: msg({
		message: "import a folder",
	}),
	importProject: msg({
		message: "import the project",
	}),
	loadAgentSettings: msg({
		message: "load agent settings",
	}),
	openTaskInWorkspace: msg({
		message: "open the task in a workspace",
	}),
	removeAgent: msg({
		message: "remove the agent",
	}),
	removePrLink: msg({
		message: "remove the PR link",
	}),
	renameBranch: msg({
		message: "rename the branch",
	}),
	reorderAgents: msg({
		message: "reorder agents",
	}),
	resetAgents: msg({
		message: "reset agents",
	}),
	resolveWorkspacePath: msg({
		message: "resolve the workspace path",
	}),
	restoreAgentDefaults: msg({
		message: "restore the agent defaults",
	}),
	runIssuesInWorkspaces: msg({
		message: "run issues in workspaces",
	}),
	runTasksInWorkspaces: msg({
		message: "run tasks in workspaces",
	}),
	saveAgent: msg({
		message: "save the agent",
	}),
	saveAgentCommand: msg({
		message: "save the agent command",
	}),
	updateBranchPrefix: msg({
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
			...msg({
				message: "organization {id}",
			}),
			values: { id: shortId(context.activeOrganizationId) },
		});
	}
	return i18n._(
		msg({
			message: "the active organization",
		}),
	);
}

function formatDevice(context: HostServiceUnavailableContext): string {
	return context.machineId
		? i18n._({
				...msg({
					message: "this device ({id})",
				}),
				values: { id: shortId(context.machineId) },
			})
		: i18n._(
				msg({
					message: "this device",
				}),
			);
}

function statusLabel(status: HostServiceAvailabilityStatus): string {
	switch (status) {
		case "starting":
			return i18n._(
				msg({
					message: "starting",
				}),
			);
		case "running":
			return i18n._(
				msg({
					message: "running",
				}),
			);
		case "stopped":
			return i18n._(
				msg({
					message: "stopped",
				}),
			);
		case "unknown":
			return i18n._(
				msg({
					message: "unknown",
				}),
			);
	}
}

function getRecoveryText(status: HostServiceAvailabilityStatus): string {
	switch (status) {
		case "starting":
			return i18n._(
				msg({
					message: "Retry in a few seconds.",
				}),
			);
		case "stopped":
			return i18n._(
				msg({
					message:
						"Use the Superset tray menu > Host Service > Restart, then retry.",
				}),
			);
		case "running":
			return i18n._(
				msg({
					message: "Retry after the connection refreshes.",
				}),
			);
		case "unknown":
			return i18n._(
				msg({
					message: "Retry in a few seconds; if it persists, restart Superset.",
				}),
			);
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
					...msg({
						message:
							"Cannot {action}: no active organization is selected. Select an organization or sign in again.",
					}),
					values: { action },
				})
			: i18n._(
					msg({
						message:
							"No active organization is selected. Select an organization or sign in again.",
					}),
				);
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
				...msg({
					message:
						"Cannot {action}: the local host service is unavailable for {organization} on {device}. Status: {status}. {recovery}",
				}),
				values: {
					action,
					organization,
					device,
					status: statusText,
					recovery,
				},
			})
		: i18n._({
				...msg({
					message:
						"The local host service is unavailable for {organization} on {device}. Status: {status}. {recovery}",
				}),
				values: { organization, device, status: statusText, recovery },
			});
}

export function showHostServiceUnavailableToast(
	context: HostServiceUnavailableContext,
	options: HostServiceUnavailableMessageOptions = {},
): void {
	toast.error(
		i18n._(
			msg({
				message: "Host service unavailable",
			}),
		),
		{
			description: getHostServiceUnavailableMessage(context, options),
		},
	);
}
