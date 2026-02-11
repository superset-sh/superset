import { z } from "zod";
import type { CommandResult, ToolContext, ToolDefinition } from "./types";

const schema = z
	.object({
		workspaceId: z.string().optional(),
		workspaceName: z.string().optional(),
	})
	.refine((data) => data.workspaceId || data.workspaceName, {
		message: "Must provide workspaceId or workspaceName",
	});

async function execute(
	params: z.infer<typeof schema>,
	ctx: ToolContext,
): Promise<CommandResult> {
	let targetWorkspaceId = params.workspaceId;

	// Look up by name if no ID provided
	if (!targetWorkspaceId && params.workspaceName) {
		const workspaces = ctx.getWorkspaces();
		if (!workspaces) {
			return { success: false, error: "Failed to get workspaces" };
		}

		const searchName = params.workspaceName.toLowerCase();
		const found = workspaces.find(
			(ws) =>
				ws.name.toLowerCase() === searchName ||
				ws.branch.toLowerCase() === searchName,
		);

		if (!found) {
			return {
				success: false,
				error: `Workspace "${params.workspaceName}" not found`,
			};
		}
		targetWorkspaceId = found.id;
	}

	if (!targetWorkspaceId) {
		return {
			success: false,
			error: "Could not determine workspace to navigate to",
		};
	}

	try {
		await ctx.navigateToWorkspace(targetWorkspaceId);
		return {
			success: true,
			data: { workspaceId: targetWorkspaceId },
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to navigate",
		};
	}
}

export const navigateToWorkspace: ToolDefinition<typeof schema> = {
	name: "navigate_to_workspace",
	schema,
	execute,
};
