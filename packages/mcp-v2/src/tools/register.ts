import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	type McpToolCallEmitter,
	setServerToolCallEmitter,
} from "../define-tool";

import * as automationsCreate from "./automations/create";
import * as automationsDelete from "./automations/delete";
import * as automationsGet from "./automations/get";
import * as automationsGetPrompt from "./automations/get_prompt";
import * as automationsList from "./automations/list";
import * as automationsLogs from "./automations/logs";
import * as automationsPause from "./automations/pause";
import * as automationsResume from "./automations/resume";
import * as automationsRun from "./automations/run";
import * as automationsSetPrompt from "./automations/set_prompt";
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
	automationsGetPrompt,
	automationsCreate,
	automationsUpdate,
	automationsSetPrompt,
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

export interface RegisterToolsOptions {
	onToolCall?: McpToolCallEmitter;
}

export function registerTools(
	server: McpServer,
	options?: RegisterToolsOptions,
): void {
	setServerToolCallEmitter(server, options?.onToolCall);
	for (const mod of REGISTRARS) {
		mod.register(server);
	}
}
