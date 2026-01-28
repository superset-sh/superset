import { z } from "zod";
import type { CommandResult, ToolContext, ToolDefinition } from "./types";

const schema = z.object({
	name: z.string().optional(),
	branchName: z.string().optional(),
	baseBranch: z.string().optional(),
});

async function execute(
	params: z.infer<typeof schema>,
	ctx: ToolContext,
): Promise<CommandResult> {
	// Derive projectId from current workspace or use the only available project
	const workspaces = ctx.getWorkspaces();
	if (!workspaces || workspaces.length === 0) {
		return { success: false, error: "No workspaces available" };
	}

	// Try to get from current workspace first
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

	// Fall back to the most recently used workspace's project
	if (!projectId) {
		const sorted = [...workspaces].sort(
			(a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0),
		);
		projectId = sorted[0].projectId;
	}

	try {
		const result = await ctx.createWorktree.mutateAsync({
			projectId,
			name: params.name,
			branchName: params.branchName,
			baseBranch: params.baseBranch,
		});

		return {
			success: true,
			data: {
				workspaceId: result.workspace.id,
				workspaceName: result.workspace.name,
				branch: result.workspace.branch,
			},
		};
	} catch (error) {
		return {
			success: false,
			error:
				error instanceof Error ? error.message : "Failed to create workspace",
		};
	}
}

export const createWorkspace: ToolDefinition<typeof schema> = {
	name: "create_workspace",
	schema,
	execute,
};
