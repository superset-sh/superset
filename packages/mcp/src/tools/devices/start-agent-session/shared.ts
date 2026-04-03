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
	STARTABLE_AGENT_LABELS,
	STARTABLE_AGENT_TYPES,
} from "@superset/shared/agent-launch";
import { and, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { type ZodError, z } from "zod";
import type { McpContext } from "../../../auth";
import { executeOnDevice } from "../../utils";

export const START_AGENT_SESSION_TOOL_NAME = "start_agent_session";
export const START_AGENT_SESSION_WITH_PROMPT_TOOL_NAME =
	"start_agent_session_with_prompt";
export const START_AGENT_SESSION_TOOL_NAMES = [
	START_AGENT_SESSION_TOOL_NAME,
	START_AGENT_SESSION_WITH_PROMPT_TOOL_NAME,
] as const;

export type StartAgentSessionToolName =
	(typeof START_AGENT_SESSION_TOOL_NAMES)[number];

export const nonEmptyString = z.string().trim().min(1);

function describeSupportedAgents(): string {
	const quotedAgents = STARTABLE_AGENT_TYPES.map((agent) => `"${agent}"`);
	const lastAgent = quotedAgents.at(-1);
	if (!lastAgent) {
		return 'AI agent to use. Defaults to "claude".';
	}

	if (quotedAgents.length === 1) {
		return `AI agent to use: ${lastAgent}. Defaults to "claude".`;
	}

	return `AI agent to use: ${quotedAgents.slice(0, -1).join(", ")}, or ${lastAgent}. Defaults to "claude".`;
}

export const commonInputSchemaShape = {
	deviceId: nonEmptyString.describe("Target device ID"),
	workspaceId: nonEmptyString.describe(
		"Workspace ID to run the session in (from create_workspace)",
	),
	paneId: nonEmptyString
		.optional()
		.describe(
			"Optional pane ID. When provided, launches relative to the tab containing this pane.",
		),
	agent: z
		.enum(STARTABLE_AGENT_TYPES)
		.optional()
		.describe(describeSupportedAgents()),
};

export const taskInputSchemaShape = {
	...commonInputSchemaShape,
	taskId: nonEmptyString.describe("Task ID to work on."),
};

export const promptInputSchemaShape = {
	...commonInputSchemaShape,
	prompt: nonEmptyString.describe(
		"Direct prompt to start the agent with for task-free launches.",
	),
};

export const taskInputSchema = z.object(taskInputSchemaShape);
export const promptInputSchema = z.object(promptInputSchemaShape);

export const ERROR_TASK_NOT_FOUND = {
	content: [{ type: "text" as const, text: "Error: Task not found" }],
	isError: true,
};

export function createValidationErrorResult(error: ZodError) {
	return {
		content: [
			{
				type: "text" as const,
				text: `Error: ${error.issues.map((issue) => issue.message).join(", ")}`,
			},
		],
		isError: true,
	};
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

type TaskRecord = NonNullable<Awaited<ReturnType<typeof fetchTask>>>;

export async function fetchTaskForOrganization({
	taskId,
	organizationId,
}: {
	taskId: string;
	organizationId: string;
}): Promise<TaskRecord | null> {
	return fetchTask({ taskId, organizationId });
}

export function buildTaskLaunchRequest({
	workspaceId,
	paneId,
	agent,
	task,
}: {
	workspaceId: string;
	paneId?: string;
	agent: (typeof STARTABLE_AGENT_TYPES)[number];
	task: TaskRecord;
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

export function buildPromptLaunchRequest({
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
			name: STARTABLE_AGENT_LABELS[agent],
			...(paneId ? { paneId } : {}),
		},
	};
}

function buildExecuteParams({
	workspaceId,
	paneId,
	agent,
	request,
}: {
	workspaceId: string;
	paneId?: string;
	agent: (typeof STARTABLE_AGENT_TYPES)[number];
	request: AgentLaunchRequest;
}): Record<string, unknown> {
	const params: Record<string, unknown> = {
		workspaceId,
		request,
		agentType: agent,
		...(paneId ? { paneId } : {}),
	};

	if (request.kind === "terminal") {
		params.command = request.terminal.command;
		if (request.terminal.name) {
			params.name = request.terminal.name;
		}
	} else {
		params.openChatPane = true;
		params.chatLaunchConfig = {
			initialPrompt: request.chat.initialPrompt,
			retryCount: request.chat.retryCount,
			...(request.chat.model ? { model: request.chat.model } : {}),
		};
	}

	return params;
}

export function executeLaunchOnDevice({
	ctx,
	deviceId,
	tool,
	workspaceId,
	paneId,
	agent,
	request,
}: {
	ctx: McpContext;
	deviceId: string;
	tool: StartAgentSessionToolName;
	workspaceId: string;
	paneId?: string;
	agent: (typeof STARTABLE_AGENT_TYPES)[number];
	request: AgentLaunchRequest;
}) {
	return executeOnDevice({
		ctx,
		deviceId,
		tool,
		params: buildExecuteParams({
			workspaceId,
			paneId,
			agent,
			request,
		}),
	});
}
