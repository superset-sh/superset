import { z } from "zod";
import type { CommandResult, ToolContext, ToolDefinition } from "./types";

const schema = z.object({
	workspaceId: z.string(),
});

async function execute(
	params: z.infer<typeof schema>,
	ctx: ToolContext,
): Promise<CommandResult> {
	try {
		const result = await ctx.deleteWorkspace.mutateAsync({
			id: params.workspaceId,
		});

		if (!result.success) {
			return { success: false, error: result.error ?? "Delete failed" };
		}

		return { success: true, data: { workspaceId: params.workspaceId } };
	} catch (error) {
		return {
			success: false,
			error:
				error instanceof Error ? error.message : "Failed to delete workspace",
		};
	}
}

export const deleteWorkspace: ToolDefinition<typeof schema> = {
	name: "delete_workspace",
	schema,
	execute,
};
