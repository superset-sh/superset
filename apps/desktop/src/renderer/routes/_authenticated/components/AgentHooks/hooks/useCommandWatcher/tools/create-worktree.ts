import { z } from "zod";
import type {
	BulkItemError,
	CommandResult,
	ToolContext,
	ToolDefinition,
} from "./types";
import { buildBulkResult } from "./types";

const workspaceInputSchema = z.object({
	name: z.string().optional(),
	branchName: z.string().optional(),
	baseBranch: z.string().optional(),
});

const schema = z.object({
	workspaces: z.array(workspaceInputSchema).min(1).max(5),
});

interface CreatedWorkspace {
	workspaceId: string;
	workspaceName: string;
	branch: string;
}

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

	const created: CreatedWorkspace[] = [];
	const errors: BulkItemError[] = [];

	for (const [i, input] of params.workspaces.entries()) {
		try {
			const result = await ctx.createWorktree.mutateAsync({
				projectId,
				name: input.name,
				branchName: input.branchName,
				baseBranch: input.baseBranch,
			});

			created.push({
				workspaceId: result.workspace.id,
				workspaceName: result.workspace.name,
				branch: result.workspace.branch,
			});
		} catch (error) {
			errors.push({
				index: i,
				name: input.name,
				branchName: input.branchName,
				error:
					error instanceof Error ? error.message : "Failed to create workspace",
			});
		}
	}

	return buildBulkResult({
		items: created,
		errors,
		itemKey: "created",
		allFailedMessage: "All workspace creations failed",
		total: params.workspaces.length,
	});
}

export const createWorkspace: ToolDefinition<typeof schema> = {
	name: "create_workspace",
	schema,
	execute,
};
