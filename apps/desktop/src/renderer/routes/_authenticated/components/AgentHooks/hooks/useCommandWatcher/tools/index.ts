import { createWorkspace } from "./create-worktree";
import { deleteWorkspace } from "./delete-workspace";
import { getAppContext } from "./get-app-context";
import { getWorkspaceDetails } from "./get-workspace-details";
import { listProjects } from "./list-projects";
import { listWorkspaces } from "./list-workspaces";
import { navigateToWorkspace } from "./navigate-to-workspace";
import { startAgentSession } from "./start-agent-session";
import { switchWorkspace } from "./switch-workspace";
import type { CommandResult, ToolContext, ToolDefinition } from "./types";
import { updateWorkspace } from "./update-workspace";

// Registry of all available tools
// biome-ignore lint/suspicious/noExplicitAny: Tool schemas vary
const tools: ToolDefinition<any>[] = [
	createWorkspace,
	deleteWorkspace,
	getAppContext,
	getWorkspaceDetails,
	listProjects,
	listWorkspaces,
	navigateToWorkspace,
	startAgentSession,
	switchWorkspace,
	updateWorkspace,
];

// Map for O(1) lookup by name
const toolsByName = new Map(tools.map((t) => [t.name, t]));

/**
 * Execute a tool by name with validation.
 * Returns error if tool not found or params invalid.
 */
export async function executeTool(
	name: string,
	params: Record<string, unknown> | null,
	ctx: ToolContext,
): Promise<CommandResult> {
	const tool = toolsByName.get(name);

	if (!tool) {
		return { success: false, error: `Unknown tool: ${name}` };
	}

	// Validate params
	const parsed = tool.schema.safeParse(params ?? {});
	if (!parsed.success) {
		return {
			success: false,
			error: `Invalid params: ${parsed.error.errors.map((e: { message: string }) => e.message).join(", ")}`,
		};
	}

	return tool.execute(parsed.data, ctx);
}

export type { CommandResult, ToolContext } from "./types";
