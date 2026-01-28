import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { register as registerCreateWorkspace } from "./devices/create-workspace";
import { register as registerDeleteWorkspace } from "./devices/delete-workspace";
import { register as registerGetAppContext } from "./devices/get-app-context";
// Devices
import { register as registerListDevices } from "./devices/list-devices";
import { register as registerListProjects } from "./devices/list-projects";
import { register as registerListWorkspaces } from "./devices/list-workspaces";
import { register as registerNavigateToWorkspace } from "./devices/navigate-to-workspace";
import { register as registerSwitchWorkspace } from "./devices/switch-workspace";
// Organizations
import { register as registerListMembers } from "./organizations/list-members";
// Tasks
import { register as registerCreateTask } from "./tasks/create-task";
import { register as registerDeleteTask } from "./tasks/delete-task";
import { register as registerGetTask } from "./tasks/get-task";
import { register as registerListTaskStatuses } from "./tasks/list-task-statuses";
import { register as registerListTasks } from "./tasks/list-tasks";
import { register as registerUpdateTask } from "./tasks/update-task";

export function registerTools(server: McpServer) {
	// Tasks
	registerCreateTask(server);
	registerUpdateTask(server);
	registerListTasks(server);
	registerGetTask(server);
	registerDeleteTask(server);
	registerListTaskStatuses(server);

	// Organizations
	registerListMembers(server);

	// Devices
	registerListDevices(server);
	registerListWorkspaces(server);
	registerListProjects(server);
	registerGetAppContext(server);
	registerNavigateToWorkspace(server);
	registerCreateWorkspace(server);
	registerSwitchWorkspace(server);
	registerDeleteWorkspace(server);
}
