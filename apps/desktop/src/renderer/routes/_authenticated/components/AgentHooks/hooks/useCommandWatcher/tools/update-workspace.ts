import { z } from "zod";
import type {
	BulkItemError,
	CommandResult,
	ToolContext,
	ToolDefinition,
} from "./types";
import { buildBulkResult } from "./types";

const workspaceUpdateSchema = z.object({
	workspaceId: z.string().min(1),
	name: z.string().min(1),
});

const schema = z.object({
	updates: z.array(workspaceUpdateSchema).min(1).max(5),
});

interface UpdatedWorkspace {
	workspaceId: string;
	name: string;
}

async function execute(
	params: z.infer<typeof schema>,
	ctx: ToolContext,
): Promise<CommandResult> {
	const updated: UpdatedWorkspace[] = [];
	const errors: BulkItemError[] = [];

	for (const [i, update] of params.updates.entries()) {
		try {
			await ctx.updateWorkspace.mutateAsync({
				id: update.workspaceId,
				patch: { name: update.name },
			});

			updated.push({
				workspaceId: update.workspaceId,
				name: update.name,
			});
		} catch (error) {
			errors.push({
				index: i,
				workspaceId: update.workspaceId,
				error:
					error instanceof Error ? error.message : "Failed to update workspace",
			});
		}
	}

	return buildBulkResult({
		items: updated,
		errors,
		itemKey: "updated",
		allFailedMessage: "All workspace updates failed",
		total: params.updates.length,
	});
}

export const updateWorkspace: ToolDefinition<typeof schema> = {
	name: "update_workspace",
	schema,
	execute,
};
