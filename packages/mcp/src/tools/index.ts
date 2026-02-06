import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { trackToolCall } from "../analytics";
import { register as createWorkspace } from "./devices/create-workspace";
import { register as deleteWorkspace } from "./devices/delete-workspace";
import { register as getAppContext } from "./devices/get-app-context";
import { register as listDevices } from "./devices/list-devices";
import { register as listProjects } from "./devices/list-projects";
import { register as listWorkspaces } from "./devices/list-workspaces";
import { register as navigateToWorkspace } from "./devices/navigate-to-workspace";
import { register as startClaudeSession } from "./devices/start-claude-session";
import { register as switchWorkspace } from "./devices/switch-workspace";
import { register as updateWorkspace } from "./devices/update-workspace";
import { register as listMembers } from "./organizations/list-members";
import { register as createTask } from "./tasks/create-task";
import { register as deleteTask } from "./tasks/delete-task";
import { register as getTask } from "./tasks/get-task";
import { register as listTaskStatuses } from "./tasks/list-task-statuses";
import { register as listTasks } from "./tasks/list-tasks";
import { register as updateTask } from "./tasks/update-task";

const allTools = [
	createTask,
	updateTask,
	listTasks,
	getTask,
	deleteTask,
	listTaskStatuses,
	listMembers,
	listDevices,
	listWorkspaces,
	listProjects,
	getAppContext,
	navigateToWorkspace,
	createWorkspace,
	switchWorkspace,
	deleteWorkspace,
	updateWorkspace,
	startClaudeSession,
];

/**
 * Wraps McpServer.registerTool to automatically track all tool calls via PostHog.
 * The wrapper intercepts the handler (last argument) and fires a `mcp_tool_called`
 * event with the tool name, source (clientId), and user context after execution.
 */
function withToolTracking(server: McpServer): McpServer {
	const original = server.registerTool.bind(server);

	// biome-ignore lint/suspicious/noExplicitAny: MCP SDK registerTool has complex overloads
	(server as any).registerTool = (name: string, ...rest: any[]) => {
		const handler = rest[rest.length - 1];
		if (typeof handler === "function") {
			// biome-ignore lint/suspicious/noExplicitAny: handler args from MCP SDK
			rest[rest.length - 1] = async (args: any, extra: any) => {
				const result = await handler(args, extra);
				trackToolCall({ toolName: name, extra });
				return result;
			};
		}
		// biome-ignore lint/suspicious/noExplicitAny: forwarding to original overloaded method
		return (original as any)(name, ...rest);
	};

	return server;
}

export function registerTools(server: McpServer) {
	const tracked = withToolTracking(server);

	for (const register of allTools) {
		register(tracked);
	}
}
