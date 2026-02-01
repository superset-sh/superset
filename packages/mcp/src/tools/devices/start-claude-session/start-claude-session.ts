import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@superset/db/client";
import { taskStatuses, tasks } from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { executeOnDevice, getMcpContext } from "../../utils";

function buildCommand(
	task: NonNullable<Awaited<ReturnType<typeof fetchTask>>>,
): string {
	const metadata = [
		`Priority: ${task.priority}`,
		task.statusName && `Status: ${task.statusName}`,
		task.labels?.length && `Labels: ${task.labels.join(", ")}`,
	]
		.filter(Boolean)
		.join("\n");

	const prompt = `You are working on task "${task.title}" (${task.slug}).

${metadata}

## Task Description

${task.description || "No description provided."}

## Instructions

You are running fully autonomously. Do not ask questions or wait for user feedback — make all decisions independently based on the codebase and task description.

1. Explore the codebase to understand the relevant code and architecture
2. Create a detailed execution plan for this task including:
   - Purpose and scope of the changes
   - Key assumptions
   - Concrete implementation steps with specific files to modify
   - How to validate the changes work correctly
3. Implement the plan
4. Verify your changes work correctly (run relevant tests, typecheck, lint)
5. When done, use the Superset MCP \`update_task\` tool to update task "${task.id}" with a summary of what was done`;

	return [
		"claude --dangerously-skip-permissions \"$(cat <<'SUPERSET_PROMPT'",
		prompt,
		"SUPERSET_PROMPT",
		')"',
	].join("\n");
}

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
} | null {
	const deviceId = args.deviceId as string;
	const taskId = args.taskId as string;
	if (!deviceId || !taskId) return null;
	return { deviceId, taskId };
}

const ERROR_DEVICE_AND_TASK_REQUIRED = {
	content: [
		{ type: "text" as const, text: "Error: deviceId and taskId are required" },
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
				"Start an autonomous Claude Code session for a task. Creates a new workspace with its own git branch and launches Claude with the task context.",
			inputSchema: {
				deviceId: z.string().describe("Target device ID"),
				taskId: z.string().describe("Task ID to work on"),
			},
		},
		async (args, extra) => {
			const ctx = getMcpContext(extra);
			const validated = validateArgs(args);
			if (!validated) return ERROR_DEVICE_AND_TASK_REQUIRED;

			const task = await fetchTask({
				taskId: validated.taskId,
				organizationId: ctx.organizationId,
			});
			if (!task) return ERROR_TASK_NOT_FOUND;

			return executeOnDevice({
				ctx,
				deviceId: validated.deviceId,
				tool: "start_claude_session",
				params: { command: buildCommand(task), name: task.slug },
			});
		},
	);

	server.registerTool(
		"start_claude_subagent",
		{
			description:
				"Start a Claude Code subagent for a task in an existing workspace. Adds a new terminal pane to the active workspace instead of creating a new one. Use this when you want to run Claude alongside your current work.",
			inputSchema: {
				deviceId: z.string().describe("Target device ID"),
				taskId: z.string().describe("Task ID to work on"),
			},
		},
		async (args, extra) => {
			const ctx = getMcpContext(extra);
			const validated = validateArgs(args);
			if (!validated) return ERROR_DEVICE_AND_TASK_REQUIRED;

			const task = await fetchTask({
				taskId: validated.taskId,
				organizationId: ctx.organizationId,
			});
			if (!task) return ERROR_TASK_NOT_FOUND;

			return executeOnDevice({
				ctx,
				deviceId: validated.deviceId,
				tool: "start_claude_subagent",
				params: { command: buildCommand(task) },
			});
		},
	);
}
