import {
	chatLaunchConfigSchema,
	normalizeAgentLaunchRequest,
	STARTABLE_AGENT_TYPES,
} from "@superset/shared/agent-launch";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import {
	launchAgentSession,
	queueAgentSessionLaunch,
} from "renderer/lib/agent-session-orchestrator";
import { posthog } from "renderer/lib/posthog";
import { launchCommandInPane } from "renderer/lib/terminal/launch-command";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useWorkspaceInitStore } from "renderer/stores/workspace-init";
import { z } from "zod";
import type { CommandResult, ToolContext, ToolDefinition } from "./types";

type WorkspaceRecord = NonNullable<
	ReturnType<ToolContext["getWorkspaces"]>
>[number];

const schema = z.object({
	workspaceId: z.string(),
	command: z.string().optional(),
	name: z.string().optional(),
	paneId: z.string().optional(),
	openChatPane: z.boolean().optional(),
	chatLaunchConfig: chatLaunchConfigSchema.partial().optional(),
	idempotencyKey: z.string().optional(),
	agentType: z.enum(STARTABLE_AGENT_TYPES).optional(),
	request: z.unknown().optional(),
});

function runLegacyTerminalLaunch(
	params: {
		workspaceId: string;
		command: string;
		name?: string;
		paneId?: string;
	},
	ctx: ToolContext,
	workspace: WorkspaceRecord,
): Promise<CommandResult> {
	if (params.paneId) {
		const tabsStore = useTabsStore.getState();
		const pane = tabsStore.panes[params.paneId];
		if (!pane) {
			return Promise.resolve({
				success: false,
				error: `Pane not found: ${params.paneId}`,
			});
		}

		const tab = tabsStore.tabs.find((t) => t.id === pane.tabId);
		if (!tab || tab.workspaceId !== workspace.id) {
			return Promise.resolve({
				success: false,
				error: `Tab not found for pane: ${params.paneId}`,
			});
		}

		const newPaneId = tabsStore.addPane(tab.id);
		if (!newPaneId) {
			return Promise.resolve({ success: false, error: "Failed to add pane" });
		}

		return launchCommandInPane({
			paneId: newPaneId,
			tabId: tab.id,
			workspaceId: workspace.id,
			command: params.command,
			createOrAttach: (input) => ctx.terminalCreateOrAttach.mutateAsync(input),
			write: (input) => ctx.terminalWrite.mutateAsync(input),
		})
			.then(() => ({
				success: true,
				data: {
					workspaceId: workspace.id,
					paneId: newPaneId,
					status: "running",
				},
			}))
			.catch((error) => {
				tabsStore.removePane(newPaneId);
				return {
					success: false,
					error:
						error instanceof Error
							? error.message
							: "Failed to start agent session",
				};
			});
	}

	const store = useWorkspaceInitStore.getState();
	const pending = store.pendingTerminalSetups[workspace.id];
	store.addPendingTerminalSetup({
		workspaceId: workspace.id,
		projectId: pending?.projectId ?? workspace.projectId,
		initialCommands: pending?.initialCommands ?? null,
		defaultPresets: pending?.defaultPresets,
		agentCommand: params.command,
	});

	return Promise.resolve({
		success: true,
		data: {
			workspaceId: workspace.id,
			branch: workspace.branch,
			status: "queued",
		},
	});
}

async function execute(
	params: z.infer<typeof schema>,
	ctx: ToolContext,
): Promise<CommandResult> {
	const workspaces = ctx.getWorkspaces();
	if (!workspaces || workspaces.length === 0) {
		return { success: false, error: "No workspaces available" };
	}

	const workspace = workspaces.find((ws) => ws.id === params.workspaceId);
	if (!workspace) {
		return {
			success: false,
			error: `Workspace not found: ${params.workspaceId}`,
		};
	}

	try {
		const request = normalizeAgentLaunchRequest(
			params.request ?? {
				workspaceId: params.workspaceId,
				command: params.command,
				name: params.name,
				paneId: params.paneId,
				openChatPane: params.openChatPane,
				chatLaunchConfig: params.chatLaunchConfig,
				idempotencyKey: params.idempotencyKey,
				agentType: params.agentType,
				source: "command-watcher",
			},
		);

		const orchestratorEnabled =
			posthog.isFeatureEnabled(
				FEATURE_FLAGS.DESKTOP_AGENT_LAUNCH_ORCHESTRATOR_V1,
			) === true;

		if (!orchestratorEnabled) {
			if (request.kind !== "terminal") {
				return {
					success: false,
					error: "Chat launch path is not enabled on this desktop version.",
				};
			}

			return runLegacyTerminalLaunch(
				{
					workspaceId: request.workspaceId,
					command: request.terminal.command,
					name: request.terminal.name,
					paneId: request.terminal.paneId,
				},
				ctx,
				workspace,
			);
		}

		const hasExplicitPaneTarget =
			request.kind === "terminal"
				? Boolean(request.terminal.paneId)
				: Boolean(request.chat.paneId);

		const launchResult = hasExplicitPaneTarget
			? await launchAgentSession(request, {
					source: "command-watcher",
					createOrAttach: (input) =>
						ctx.terminalCreateOrAttach.mutateAsync(input),
					write: (input) => ctx.terminalWrite.mutateAsync(input),
				})
			: queueAgentSessionLaunch({
					request,
					projectId: workspace.projectId,
				});

		if (launchResult.status === "failed") {
			return {
				success: false,
				error: launchResult.error ?? "Failed to start agent session",
			};
		}

		return {
			success: true,
			data: {
				workspaceId: launchResult.workspaceId,
				branch: workspace.branch,
				tabId: launchResult.tabId,
				paneId: launchResult.paneId,
				sessionId: launchResult.sessionId,
				status: launchResult.status,
			},
		};
	} catch (error) {
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to start agent session",
		};
	}
}

export const startAgentSession: ToolDefinition<typeof schema> = {
	name: "start_agent_session",
	schema,
	execute,
};
