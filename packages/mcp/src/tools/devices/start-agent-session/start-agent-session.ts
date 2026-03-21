import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getMcpContext } from "../../utils";
import {
	buildTaskLaunchRequest,
	createValidationErrorResult,
	ERROR_TASK_NOT_FOUND,
	executeLaunchOnDevice,
	fetchTaskForOrganization,
	START_AGENT_SESSION_TOOL_NAME,
	taskInputSchema,
	taskInputSchemaShape,
} from "./shared";

export function registerTaskLaunchTool(server: McpServer) {
	server.registerTool(
		START_AGENT_SESSION_TOOL_NAME,
		{
			description:
				"Start an autonomous AI session for a task in an existing workspace. Supports terminal agents and Superset Chat. When paneId is provided, launch behavior is scoped to the tab containing that pane.",
			inputSchema: taskInputSchemaShape,
		},
		async (args, extra) => {
			const parsed = taskInputSchema.safeParse(args);
			if (!parsed.success) {
				return createValidationErrorResult(parsed.error);
			}

			const ctx = getMcpContext(extra);
			const input = parsed.data;
			const agent = input.agent ?? "claude";
			const task = await fetchTaskForOrganization({
				taskId: input.taskId,
				organizationId: ctx.organizationId,
			});
			if (!task) return ERROR_TASK_NOT_FOUND;

			const request = buildTaskLaunchRequest({
				workspaceId: input.workspaceId,
				paneId: input.paneId,
				agent,
				task,
			});

			return executeLaunchOnDevice({
				ctx,
				deviceId: input.deviceId,
				tool: START_AGENT_SESSION_TOOL_NAME,
				workspaceId: input.workspaceId,
				paneId: input.paneId,
				agent,
				request,
			});
		},
	);
}
