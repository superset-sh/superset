import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getMcpContext } from "../../utils";
import {
	buildPromptLaunchRequest,
	createValidationErrorResult,
	executeLaunchOnDevice,
	promptInputSchema,
	promptInputSchemaShape,
	START_AGENT_SESSION_WITH_PROMPT_TOOL_NAME,
} from "./shared";

export function registerPromptLaunchTool(server: McpServer) {
	server.registerTool(
		START_AGENT_SESSION_WITH_PROMPT_TOOL_NAME,
		{
			description:
				"Start an autonomous AI session in an existing workspace using a direct prompt instead of a task. Supports terminal agents and Superset Chat. When paneId is provided, launch behavior is scoped to the tab containing that pane.",
			inputSchema: promptInputSchemaShape,
		},
		async (args, extra) => {
			const parsed = promptInputSchema.safeParse(args);
			if (!parsed.success) {
				return createValidationErrorResult(parsed.error);
			}

			const ctx = getMcpContext(extra);
			const input = parsed.data;
			const agent = input.agent ?? "claude";
			const request = buildPromptLaunchRequest({
				workspaceId: input.workspaceId,
				paneId: input.paneId,
				agent,
				prompt: input.prompt,
			});

			return executeLaunchOnDevice({
				ctx,
				deviceId: input.deviceId,
				tool: START_AGENT_SESSION_WITH_PROMPT_TOOL_NAME,
				workspaceId: input.workspaceId,
				paneId: input.paneId,
				agent,
				request,
			});
		},
	);
}
