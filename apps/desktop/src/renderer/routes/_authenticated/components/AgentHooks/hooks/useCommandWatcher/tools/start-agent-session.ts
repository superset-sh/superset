import { launchCommandInPane } from "renderer/lib/terminal/launch-command";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useWorkspaceInitStore } from "renderer/stores/workspace-init";
import { z } from "zod";
import type { CommandResult, ToolContext, ToolDefinition } from "./types";

const schema = z.object({
	command: z.string().optional(),
	name: z.string(),
	workspaceId: z.string(),
	paneId: z.string().optional(),
	chatLaunchConfig: z
		.object({
			initialPrompt: z.string().optional(),
			metadata: z
				.object({
					model: z.string().optional(),
				})
				.optional(),
		})
		.optional(),
	openChatPane: z.boolean().optional(),
});

function hasChatLaunchRequest(params: z.infer<typeof schema>): boolean {
	return Boolean(params.chatLaunchConfig || params.openChatPane);
}

function hasActionablePayload(params: z.infer<typeof schema>): boolean {
	return Boolean(params.command || hasChatLaunchRequest(params));
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
	if (!hasActionablePayload(params)) {
		return {
			success: false,
			error:
				"Missing payload: provide command or chat launch config for start_agent_session.",
		};
	}

	try {
		if (params.paneId) {
			const tabsStore = useTabsStore.getState();
			const pane = tabsStore.panes[params.paneId];
			if (!pane) {
				return {
					success: false,
					error: `Pane not found: ${params.paneId}`,
				};
			}

			const tab = tabsStore.tabs.find((t) => t.id === pane.tabId);
			if (!tab || tab.workspaceId !== workspace.id) {
				return {
					success: false,
					error: `Tab not found for pane: ${params.paneId}`,
				};
			}

			if (hasChatLaunchRequest(params)) {
				const chatPaneId = tabsStore.addChatMastraPane(tab.id, {
					launchConfig: params.chatLaunchConfig ?? null,
				});
				if (!chatPaneId) {
					return {
						success: false,
						error: "Failed to add chat pane",
					};
				}
				return {
					success: true,
					data: { workspaceId: workspace.id, paneId: chatPaneId },
				};
			}
			if (!params.command) {
				return {
					success: false,
					error: "No agent command provided",
				};
			}

			const newPaneId = tabsStore.addPane(tab.id);

			if (!newPaneId) {
				return { success: false, error: "Failed to add pane" };
			}

			try {
				await launchCommandInPane({
					paneId: newPaneId,
					tabId: tab.id,
					workspaceId: workspace.id,
					command: params.command,
					createOrAttach: (input) =>
						ctx.terminalCreateOrAttach.mutateAsync(input),
					write: (input) => ctx.terminalWrite.mutateAsync(input),
				});
			} catch (error) {
				tabsStore.removePane(newPaneId);
				return {
					success: false,
					error:
						error instanceof Error
							? error.message
							: "Failed to start agent session",
				};
			}

			return {
				success: true,
				data: { workspaceId: workspace.id, paneId: newPaneId },
			};
		}

		// Without paneId: init workspace path
		const store = useWorkspaceInitStore.getState();
		const pending = store.pendingTerminalSetups[workspace.id];
		store.addPendingTerminalSetup({
			workspaceId: workspace.id,
			projectId: pending?.projectId ?? workspace.projectId,
			initialCommands: pending?.initialCommands ?? null,
			defaultPresets: pending?.defaultPresets,
			agentCommand: params.command ?? pending?.agentCommand,
			chatLaunchConfig: params.chatLaunchConfig ?? pending?.chatLaunchConfig,
			openChatPane: params.openChatPane ?? pending?.openChatPane,
			worktreePath: pending?.worktreePath,
		});

		return {
			success: true,
			data: {
				workspaceId: workspace.id,
				branch: workspace.branch,
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
