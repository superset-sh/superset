import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	type McpToolCallEmitter,
	setServerToolCallEmitter,
} from "../define-tool";

import * as agentsCreate from "./agents/create";
import * as agentsList from "./agents/list";
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
import * as organizationMembersList from "./organization/members/list";
import * as pagesCommentsList from "./pages/comments/list";
import * as pagesCommentsReply from "./pages/comments/reply";
import * as pagesCommentsResolve from "./pages/comments/resolve";
import * as pagesGet from "./pages/get";
import * as pagesList from "./pages/list";
import * as pagesPublish from "./pages/publish";
import * as pagesPull from "./pages/pull";
import * as pagesVersions from "./pages/versions";
import * as projectsList from "./projects/list";
import * as tasksCreate from "./tasks/create";
import * as tasksDelete from "./tasks/delete";
import * as tasksGet from "./tasks/get";
import * as tasksList from "./tasks/list";
import * as tasksStatusesList from "./tasks/statuses/list";
import * as tasksUpdate from "./tasks/update";
import * as terminalsClose from "./terminals/close";
import * as terminalsCreate from "./terminals/create";
import * as terminalsList from "./terminals/list";
import * as terminalsRead from "./terminals/read";
import * as terminalsSend from "./terminals/send";
import * as workspacesCreate from "./workspaces/create";
import * as workspacesDelete from "./workspaces/delete";
import * as workspacesList from "./workspaces/list";
import * as workspacesUpdate from "./workspaces/update";

const REGISTRARS = [
	tasksList,
	tasksGet,
	tasksCreate,
	tasksUpdate,
	tasksDelete,
	tasksStatusesList,
	organizationMembersList,
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
	workspacesUpdate,
	workspacesDelete,
	agentsCreate,
	agentsList,
	terminalsCreate,
	terminalsList,
	terminalsSend,
	terminalsRead,
	terminalsClose,
	pagesList,
	pagesGet,
	pagesVersions,
	pagesPull,
	pagesPublish,
	pagesCommentsList,
	pagesCommentsReply,
	pagesCommentsResolve,
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
