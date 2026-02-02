import { useWorkspaceInitStore } from "renderer/stores/workspace-init";
import { z } from "zod";
import type { CommandResult, ToolContext, ToolDefinition } from "./types";

const schema = z.object({
	command: z.string(),
	name: z.string(),
});

async function execute(
	params: z.infer<typeof schema>,
	ctx: ToolContext,
): Promise<CommandResult> {
	// 1. Derive projectId from current workspace or most recent
	const workspaces = ctx.getWorkspaces();
	if (!workspaces || workspaces.length === 0) {
		return { success: false, error: "No workspaces available" };
	}

	let projectId: string | null = null;
	const activeWorkspaceId = ctx.getActiveWorkspaceId();
	if (activeWorkspaceId) {
		const activeWorkspace = workspaces.find(
			(ws) => ws.id === activeWorkspaceId,
		);
		if (activeWorkspace) {
			projectId = activeWorkspace.projectId;
		}
	}

	if (!projectId) {
		const sorted = [...workspaces].sort(
			(a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0),
		);
		projectId = sorted[0].projectId;
	}

	try {
		// 2. Create workspace
		const result = await ctx.createWorktree.mutateAsync({
			projectId,
			name: params.name,
			branchName: params.name,
		});

		// 3. Append command to pending terminal setup
		const store = useWorkspaceInitStore.getState();
		const pending = store.pendingTerminalSetups[result.workspace.id];
		store.addPendingTerminalSetup({
			workspaceId: result.workspace.id,
			projectId: pending?.projectId ?? projectId,
			initialCommands: [...(pending?.initialCommands ?? []), params.command],
			defaultPreset: pending?.defaultPreset ?? null,
		});

		return {
			success: true,
			data: {
				workspaceId: result.workspace.id,
				branch: result.workspace.branch,
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
