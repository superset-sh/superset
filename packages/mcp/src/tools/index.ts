import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { register as createWorkspace } from "./devices/create-workspace";
import { register as deleteWorkspace } from "./devices/delete-workspace";
import { register as getAppContext } from "./devices/get-app-context";
import { register as listDevices } from "./devices/list-devices";
import { register as listProjects } from "./devices/list-projects";
import { register as listWorkspaces } from "./devices/list-workspaces";
import { register as navigateToWorkspace } from "./devices/navigate-to-workspace";
import { register as startClaudeSession } from "./devices/start-claude-session";
import { register as switchWorkspace } from "./devices/switch-workspace";
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
	startClaudeSession,
];

export function registerTools(server: McpServer) {
	for (const register of allTools) {
		register(server);
	}
}
