import { z } from "zod";
import type { CommandResult, ToolContext, ToolDefinition } from "./types";

const schema = z.object({});

async function execute(
	_params: z.infer<typeof schema>,
	ctx: ToolContext,
): Promise<CommandResult> {
	// Hash routing: path is in window.location.hash (e.g., "#/workspace/abc123")
	const hash = window.location.hash;
	const pathname = hash.startsWith("#") ? hash.slice(1) : hash;

	// Parse workspace ID from route if present (route is /workspace/$workspaceId)
	const workspaceMatch = pathname.match(/\/workspace\/([^/]+)/);
	const currentWorkspaceId = workspaceMatch ? workspaceMatch[1] : null;

	// Get workspace details if we have an ID
	let currentWorkspace = null;
	if (currentWorkspaceId) {
		const workspaces = ctx.getWorkspaces();
		currentWorkspace =
			workspaces?.find((ws) => ws.id === currentWorkspaceId) ?? null;
	}

	return {
		success: true,
		data: {
			pathname,
			currentWorkspaceId,
			currentWorkspace,
		},
	};
}

export const getAppContext: ToolDefinition<typeof schema> = {
	name: "get_app_context",
	schema,
	execute,
};
