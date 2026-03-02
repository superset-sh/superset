import { z } from "zod";
import type { CommandResult, ToolContext, ToolDefinition } from "./types";

const schema = z.object({});

async function execute(
	_params: z.infer<typeof schema>,
	ctx: ToolContext,
): Promise<CommandResult> {
	const workspaces = ctx.getWorkspaces();

	if (!workspaces) {
		return { success: false, error: "Failed to get workspaces" };
	}

	return {
		success: true,
		data: { workspaces: workspaces as unknown as Record<string, unknown>[] },
	};
}

export const listWorkspaces: ToolDefinition<typeof schema> = {
	name: "list_workspaces",
	schema,
	execute,
};
