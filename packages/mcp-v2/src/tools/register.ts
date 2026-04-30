import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import * as automationsCreate from "./automations/create";
import * as automationsDelete from "./automations/delete";
import * as automationsGet from "./automations/get";
import * as automationsList from "./automations/list";
import * as automationsLogs from "./automations/logs";
import * as automationsPause from "./automations/pause";
import * as automationsResume from "./automations/resume";
import * as automationsRun from "./automations/run";
import * as automationsUpdate from "./automations/update";
import * as hostsList from "./hosts/list";
import * as projectsList from "./projects/list";
import * as tasksCreate from "./tasks/create";
import * as tasksDelete from "./tasks/delete";
import * as tasksGet from "./tasks/get";
import * as tasksList from "./tasks/list";
import * as tasksUpdate from "./tasks/update";
import * as workspacesCreate from "./workspaces/create";
import * as workspacesDelete from "./workspaces/delete";
import * as workspacesList from "./workspaces/list";

const REGISTRARS = [
	tasksList,
	tasksGet,
	tasksCreate,
	tasksUpdate,
	tasksDelete,
	automationsList,
	automationsGet,
	automationsCreate,
	automationsUpdate,
	automationsDelete,
	automationsPause,
	automationsResume,
	automationsRun,
	automationsLogs,
	workspacesList,
	workspacesCreate,
	workspacesDelete,
	projectsList,
	hostsList,
];

export function registerTools(server: McpServer): void {
	for (const mod of REGISTRARS) {
		mod.register(server);
	}
}
