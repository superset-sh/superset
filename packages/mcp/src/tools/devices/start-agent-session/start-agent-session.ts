import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@superset/db/client";
import { taskStatuses, tasks } from "@superset/db/schema";
import {
	type AGENT_TYPES,
	buildAgentCommand,
	buildAgentPromptCommand,
	buildAgentTaskPrompt,
} from "@superset/shared/agent-command";
import {
	type AgentLaunchRequest,
	STARTABLE_AGENT_TYPES,
} from "@superset/shared/agent-launch";
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

const inputSchemaShape = {
	deviceId: z.string().min(1).describe("Target device ID"),
	taskId: z
		.string()
		.min(1)
		.optional()
		.describe("Task ID to work on. Required unless prompt is provided."),
	prompt: z
		.string()
		.min(1)
		.optional()
		.describe(
			"Direct prompt to start the agent with. Use this for task-free launches. Required unless taskId is provided.",
		),
	workspaceId: z
		.string()
		.min(1)
		.describe("Workspace ID to run the session in (from create_workspace)"),
	paneId: z
		.string()
		.min(1)
		.optional()
		.describe(
			"Optional pane ID. When provided, launches relative to the tab containing this pane.",
		),
	agent: z
		.enum(STARTABLE_AGENT_TYPES)
		.optional()
		.describe(
			'AI agent to use: "claude", "codex", "gemini", "opencode", "copilot", "cursor-agent", or "superset-chat". Defaults to "claude".',
		),
};

const inputSchema = z.object(inputSchemaShape).refine(
	(data) => data.taskId || data.prompt,
	{ message: "Either taskId or prompt must be provided" },
);

const ERROR_TASK_NOT_FOUND = {
	content: [{ type: "text" as const, text: "Error: Task not found" }],
	isError: true,
};

function buildTaskLaunchRequest({
	workspaceId,
	paneId,
	agent,
	task,
}: {
	workspaceId: string;
	paneId?: string;
	agent: (typeof STARTABLE_AGENT_TYPES)[number];
	task: NonNullable<Awaited<ReturnType<typeof fetchTask>>>;
}): AgentLaunchRequest {
	if (agent === "superset-chat") {
		return {
			kind: "chat",
			workspaceId,
			agentType: "superset-chat",
			source: "mcp",
			chat: {
				...(paneId ? { paneId } : {}),
				initialPrompt: buildAgentTaskPrompt(task),
				retryCount: 1,
			},
		};
	}

	return {
		kind: "terminal",
		workspaceId,
		agentType: agent,
		source: "mcp",
		terminal: {
			command: buildAgentCommand({
				task,
				randomId: crypto.randomUUID(),
				agent: agent as (typeof AGENT_TYPES)[number],
			}),
			name: task.slug,
			...(paneId ? { paneId } : {}),
		},
	};
}

function buildPromptLaunchRequest({
	workspaceId,
	paneId,
	agent,
	prompt,
}: {
	workspaceId: string;
	paneId?: string;
	agent: (typeof STARTABLE_AGENT_TYPES)[number];
	prompt: string;
}): AgentLaunchRequest {
	if (agent === "superset-chat") {
		return {
			kind: "chat",
			workspaceId,
			agentType: "superset-chat",
			source: "mcp",
			chat: {
				...(paneId ? { paneId } : {}),
				initialPrompt: prompt,
				retryCount: 1,
			},
		};
	}

	return {
		kind: "terminal",
		workspaceId,
		agentType: agent,
		source: "mcp",
		terminal: {
			command: buildAgentPromptCommand({
				prompt,
				randomId: crypto.randomUUID(),
				agent: agent as (typeof AGENT_TYPES)[number],
			}),
			...(paneId ? { paneId } : {}),
		},
	};
}

export function register(server: McpServer) {
	server.registerTool(
		"start_agent_session",
		{
			description:
				"Start an autonomous AI session in an existing workspace. Provide either a taskId to work on a tracked task, or a prompt for a direct task-free launch. Supports terminal agents and Superset Chat. When paneId is provided, launch behavior is scoped to the tab containing that pane.",
			inputSchema: inputSchemaShape,
		},
		async (args, extra) => {
			const parsed = inputSchema.safeParse(args);
			if (!parsed.success) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Error: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`,
						},
					],
					isError: true,
				};
			}

			const ctx = getMcpContext(extra);
			const input = parsed.data;
			const agent = input.agent ?? "claude";

			let request: AgentLaunchRequest;

			if (input.taskId) {
				const task = await fetchTask({
					taskId: input.taskId,
					organizationId: ctx.organizationId,
				});
				if (!task) return ERROR_TASK_NOT_FOUND;

				request = buildTaskLaunchRequest({
					workspaceId: input.workspaceId,
					paneId: input.paneId,
					agent,
					task,
				});
			} else if (typeof input.prompt === "string") {
				request = buildPromptLaunchRequest({
					workspaceId: input.workspaceId,
					paneId: input.paneId,
					agent,
					prompt: input.prompt,
				});
			} else {
				return {
					content: [
						{
							type: "text" as const,
							text: "Error: Either taskId or prompt must be provided",
						},
					],
					isError: true,
				};
			}

			const params: Record<string, unknown> = {
				workspaceId: input.workspaceId,
				request,
				agentType: agent,
				...(input.paneId ? { paneId: input.paneId } : {}),
			};

			if (request.kind === "terminal") {
				params.command = request.terminal.command;
				if (request.terminal.name) params.name = request.terminal.name;
			} else {
				params.openChatPane = true;
				params.chatLaunchConfig = {
					initialPrompt: request.chat.initialPrompt,
					retryCount: request.chat.retryCount,
					...(request.chat.model ? { model: request.chat.model } : {}),
				};
			}

			return executeOnDevice({
				ctx,
				deviceId: input.deviceId,
				tool: "start_agent_session",
				params,
			});
		},
	);
}
