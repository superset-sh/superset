import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@superset/db/client";
import { taskStatuses, tasks } from "@superset/db/schema";
import { buildClaudeCommand } from "@superset/shared/claude-command";
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

function validateSessionArgs(args: Record<string, unknown>): {
	deviceId: string;
	taskId: string;
	workspaceId: string;
} | null {
	const deviceId = args.deviceId as string;
	const taskId = args.taskId as string;
	const workspaceId = args.workspaceId as string;
	if (!deviceId || !taskId || !workspaceId) return null;
	return { deviceId, taskId, workspaceId };
}

function validateSubagentArgs(args: Record<string, unknown>): {
	deviceId: string;
	taskId: string;
} | null {
	const deviceId = args.deviceId as string;
	const taskId = args.taskId as string;
	if (!deviceId || !taskId) return null;
	return { deviceId, taskId };
}

const ERROR_SESSION_ARGS_REQUIRED = {
	content: [
		{
			type: "text" as const,
			text: "Error: deviceId, taskId, and workspaceId are required",
		},
	],
	isError: true,
};

const ERROR_SUBAGENT_ARGS_REQUIRED = {
	content: [
		{
			type: "text" as const,
			text: "Error: deviceId and taskId are required",
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
		"start_claude_session",
		{
			description:
				"Start an autonomous Claude Code session for a task in an existing workspace. Launches Claude with the task context in the specified workspace. The target device must belong to the current user.",
			inputSchema: {
				deviceId: z.string().describe("Target device ID"),
				taskId: z.string().describe("Task ID to work on"),
				workspaceId: z
					.string()
					.describe(
						"Workspace ID to run the session in (from create_workspace)",
					),
			},
		},
		async (args, extra) => {
			const ctx = getMcpContext(extra);
			const validated = validateSessionArgs(args);
			if (!validated) return ERROR_SESSION_ARGS_REQUIRED;

			const task = await fetchTask({
				taskId: validated.taskId,
				organizationId: ctx.organizationId,
			});
			if (!task) return ERROR_TASK_NOT_FOUND;

			return executeOnDevice({
				ctx,
				deviceId: validated.deviceId,
				tool: "start_claude_session",
				params: {
					command: buildClaudeCommand({ task, randomId: crypto.randomUUID() }),
					name: task.slug,
					workspaceId: validated.workspaceId,
				},
			});
		},
	);

	server.registerTool(
		"start_claude_subagent",
		{
			description:
				"Start a Claude Code subagent for a task in an existing workspace. Adds a new terminal pane to the active workspace instead of creating a new one. Use this when you want to run Claude alongside your current work. The target device must belong to the current user.",
			inputSchema: {
				deviceId: z.string().describe("Target device ID"),
				taskId: z.string().describe("Task ID to work on"),
			},
		},
		async (args, extra) => {
			const ctx = getMcpContext(extra);
			const validated = validateSubagentArgs(args);
			if (!validated) return ERROR_SUBAGENT_ARGS_REQUIRED;

			const task = await fetchTask({
				taskId: validated.taskId,
				organizationId: ctx.organizationId,
			});
			if (!task) return ERROR_TASK_NOT_FOUND;

			return executeOnDevice({
				ctx,
				deviceId: validated.deviceId,
				tool: "start_claude_subagent",
				params: {
					command: buildClaudeCommand({ task, randomId: crypto.randomUUID() }),
				},
			});
		},
	);
}
