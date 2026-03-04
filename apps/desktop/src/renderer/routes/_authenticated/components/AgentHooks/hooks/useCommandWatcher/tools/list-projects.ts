import { z } from "zod";
import type { CommandResult, ToolContext, ToolDefinition } from "./types";

const schema = z.object({});

async function execute(
	_params: z.infer<typeof schema>,
	ctx: ToolContext,
): Promise<CommandResult> {
	const projects = ctx.getProjects();

	if (!projects) {
		return { success: false, error: "Projects not available" };
	}

	return {
		success: true,
		data: {
			projects: projects.map((p) => ({
				id: p.id,
				name: p.name,
				mainRepoPath: p.mainRepoPath,
				defaultBranch: p.defaultBranch,
				workspaceBaseBranch: p.workspaceBaseBranch,
				color: p.color,
				lastOpenedAt: p.lastOpenedAt,
				tabOrder: p.tabOrder,
			})),
		},
	};
}

export const listProjects: ToolDefinition<typeof schema> = {
	name: "list_projects",
	schema,
	execute,
};
