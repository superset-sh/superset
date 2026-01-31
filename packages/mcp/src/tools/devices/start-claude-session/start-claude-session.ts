import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@superset/db/client";
import { taskStatuses, tasks } from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { executeOnDevice, getMcpContext } from "../../utils";

interface TaskData {
	id: string;
	title: string;
	slug: string;
	description: string | null;
	priority: string;
	statusName: string | null;
	labels: string[] | null;
}

function buildPrompt(task: TaskData): string {
	const lines: string[] = [];

	lines.push(`You are working on task "${task.title}" (${task.slug}).`);
	lines.push("");

	lines.push(`Priority: ${task.priority}`);
	if (task.statusName) {
		lines.push(`Status: ${task.statusName}`);
	}
	if (task.labels && task.labels.length > 0) {
		lines.push(`Labels: ${task.labels.join(", ")}`);
	}
	lines.push("");

	lines.push("## Task Description");
	lines.push("");
	lines.push(task.description || "No description provided.");
	lines.push("");

	lines.push("## Instructions");
	lines.push("");
	lines.push(
		"You are running fully autonomously. Do not ask questions or wait for user feedback — make all decisions independently based on the codebase and task description.",
	);
	lines.push("");
	lines.push(
		"1. Explore the codebase to understand the relevant code and architecture",
	);
	lines.push("2. Create a detailed execution plan for this task including:");
	lines.push("   - Purpose and scope of the changes");
	lines.push("   - Key assumptions");
	lines.push(
		"   - Concrete implementation steps with specific files to modify",
	);
	lines.push("   - How to validate the changes work correctly");
	lines.push("3. Implement the plan");
	lines.push(
		"4. Verify your changes work correctly (run relevant tests, typecheck, lint)",
	);
	lines.push(
		`5. When done, use the Superset MCP \`update_task\` tool to update task "${task.id}" with a summary of what was done`,
	);

	return lines.join("\n");
}

function buildCommand(task: TaskData): string {
	const prompt = buildPrompt(task);
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
}): Promise<TaskData | null> {
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
