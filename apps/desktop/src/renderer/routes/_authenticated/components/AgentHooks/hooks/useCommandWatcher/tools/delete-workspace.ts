import { z } from "zod";
import type {
	BulkItemError,
	CommandResult,
	ToolContext,
	ToolDefinition,
} from "./types";
import { buildBulkResult } from "./types";

const schema = z.object({
	workspaceIds: z.array(z.string().min(1)).min(1).max(5),
});

interface DeletedWorkspace {
	workspaceId: string;
}

async function execute(
	params: z.infer<typeof schema>,
	ctx: ToolContext,
): Promise<CommandResult> {
	const deleted: DeletedWorkspace[] = [];
	const errors: BulkItemError[] = [];

	for (const [i, workspaceId] of params.workspaceIds.entries()) {
		try {
			const result = await ctx.deleteWorkspace.mutateAsync({
				id: workspaceId,
			});

			if (!result.success) {
				errors.push({
					index: i,
					workspaceId,
					error: result.error ?? "Delete failed",
				});
			} else {
				deleted.push({ workspaceId });
			}
		} catch (error) {
			errors.push({
				index: i,
				workspaceId,
				error:
					error instanceof Error ? error.message : "Failed to delete workspace",
			});
		}
	}

	return buildBulkResult({
		items: deleted,
		errors,
		itemKey: "deleted",
		allFailedMessage: "All workspace deletions failed",
		total: params.workspaceIds.length,
	});
}

export const deleteWorkspace: ToolDefinition<typeof schema> = {
	name: "delete_workspace",
	schema,
	execute,
};
