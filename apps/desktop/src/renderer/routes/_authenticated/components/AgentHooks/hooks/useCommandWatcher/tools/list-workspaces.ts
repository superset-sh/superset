import { z } from "zod";
import {
	buildWorkspaceList,
	type ListedWorkspace,
} from "./list-workspaces.utils";
import type { CommandResult, ToolContext, ToolDefinition } from "./types";

const schema = z.object({});

async function execute(
	_params: z.infer<typeof schema>,
	ctx: ToolContext,
): Promise<CommandResult<{ workspaces: ListedWorkspace[] }>> {
	const workspaces = ctx.getWorkspaces();

	if (!workspaces) {
		return { success: false, error: "Failed to get workspaces" };
	}

	return {
		success: true,
		data: {
			workspaces: buildWorkspaceList({
				workspaces,
				projects: ctx.getProjects(),
				activeWorkspaceId: ctx.getActiveWorkspaceId(),
				getWorktreePathByWorkspaceId: ctx.getWorktreePathByWorkspaceId,
			}),
		},
	};
}

export const listWorkspaces: ToolDefinition<
	typeof schema,
	{ workspaces: ListedWorkspace[] }
> = {
	name: "list_workspaces",
	schema,
	execute,
};
