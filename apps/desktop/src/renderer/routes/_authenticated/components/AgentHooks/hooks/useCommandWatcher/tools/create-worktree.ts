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
	projectId: z.string(),
	workspaces: z.array(workspaceInputSchema).min(1).max(5),
});

interface CreatedWorkspace {
	workspaceId: string;
	workspaceName: string;
	branch: string;
	worktreePath: string;
	wasExisting: boolean;
}

async function execute(
	params: z.infer<typeof schema>,
	ctx: ToolContext,
): Promise<CommandResult> {
	const { projectId } = params;
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
				worktreePath: result.worktreePath,
				wasExisting: result.wasExisting,
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
