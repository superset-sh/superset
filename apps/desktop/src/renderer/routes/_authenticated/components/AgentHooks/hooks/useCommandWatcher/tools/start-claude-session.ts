import { useWorkspaceInitStore } from "renderer/stores/workspace-init";
import { z } from "zod";
import type { CommandResult, ToolContext, ToolDefinition } from "./types";

const schema = z.object({
	command: z.string(),
	name: z.string(),
	workspaceId: z.string(),
});

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
		// Append command to pending terminal setup for the existing workspace
		const store = useWorkspaceInitStore.getState();
		const pending = store.pendingTerminalSetups[workspace.id];
		store.addPendingTerminalSetup({
			workspaceId: workspace.id,
			projectId: pending?.projectId ?? workspace.projectId,
			initialCommands: [...(pending?.initialCommands ?? []), params.command],
			defaultPresets: pending?.defaultPresets,
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
					: "Failed to start Claude session",
		};
	}
}

export const startClaudeSession: ToolDefinition<typeof schema> = {
	name: "start_claude_session",
	schema,
	execute,
};
