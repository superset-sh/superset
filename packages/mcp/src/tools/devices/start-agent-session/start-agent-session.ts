import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@superset/db/client";
import { taskStatuses, tasks } from "@superset/db/schema";
import { AGENT_TYPES, buildAgentCommand } from "@superset/shared/agent-command";
import { and, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { executeOnDevice, getMcpContext } from "../../utils";

async function fetchTask({
	taskId,
	organizationId,
}: {
	taskId: string;
	organizationId: string;
}) {
	const status = alias(taskStatuses, "status");
	const [task] = await db
		.select({
			id: tasks.id,
			slug: tasks.slug,
			title: tasks.title,
			description: tasks.description,
			priority: tasks.priority,
			statusName: status.name,
			labels: tasks.labels,
		})
		.from(tasks)
		.leftJoin(status, eq(tasks.statusId, status.id))
		.where(
			and(
				eq(tasks.id, taskId),
				eq(tasks.organizationId, organizationId),
				isNull(tasks.deletedAt),
			),
		)
		.limit(1);

	return task ?? null;
}

function validateArgs(args: Record<string, unknown>): {
	deviceId: string;
	taskId: string;
	workspaceId: string;
	paneId?: string;
	agent?: string;
} | null {
	const deviceId = args.deviceId as string;
	const taskId = args.taskId as string;
	const workspaceId = args.workspaceId as string;
	const paneId = args.paneId as string | undefined;
	const agent = args.agent as string | undefined;
	if (!deviceId || !taskId || !workspaceId) return null;
	return {
		deviceId,
		taskId,
		workspaceId,
		...(paneId ? { paneId } : {}),
		...(agent ? { agent } : {}),
	};
}

const ERROR_ARGS_REQUIRED = {
	content: [
		{
			type: "text" as const,
			text: "Error: deviceId, taskId, and workspaceId are required",
		},
	],
	isError: true,
};

const ERROR_TASK_NOT_FOUND = {
	content: [{ type: "text" as const, text: "Error: Task not found" }],
	isError: true,
};

export function register(server: McpServer) {
	server.registerTool(
		"start_agent_session",
		{
			description:
				"Start an autonomous AI agent session for a task in an existing workspace. Launches the specified agent (defaults to Claude) with the task context in the specified workspace. When paneId is provided, adds a new terminal pane to the tab containing that pane (subagent behavior) instead of initializing the workspace. The target device must belong to the current user.",
			inputSchema: {
				deviceId: z.string().describe("Target device ID"),
				taskId: z.string().describe("Task ID to work on"),
				workspaceId: z
					.string()
					.describe(
						"Workspace ID to run the session in (from create_workspace)",
					),
				paneId: z
					.string()
					.optional()
					.describe(
						"Optional pane ID. When provided, adds a new pane to the tab containing this pane instead of initializing the workspace.",
					),
				agent: z
					.enum(AGENT_TYPES)
					.optional()
					.describe(
						'AI agent to use: "claude", "codex", "gemini", "opencode", "copilot", or "cursor-agent". Defaults to "claude".',
					),
			},
		},
		async (args, extra) => {
			const ctx = getMcpContext(extra);
			const validated = validateArgs(args);
			if (!validated) return ERROR_ARGS_REQUIRED;

			const agent =
				(validated.agent as (typeof AGENT_TYPES)[number]) ?? "claude";

			const task = await fetchTask({
				taskId: validated.taskId,
				organizationId: ctx.organizationId,
			});
			if (!task) return ERROR_TASK_NOT_FOUND;

			return executeOnDevice({
				ctx,
				deviceId: validated.deviceId,
				tool: "start_agent_session",
				params: {
					command: buildAgentCommand({
						task,
						randomId: crypto.randomUUID(),
						agent,
					}),
					name: task.slug,
					workspaceId: validated.workspaceId,
					...(validated.paneId ? { paneId: validated.paneId } : {}),
				},
			});
		},
	);
}
