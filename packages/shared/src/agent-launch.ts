import { z } from "zod";
import { BUILTIN_AGENT_IDS, BUILTIN_AGENT_LABELS } from "./agent-catalog";
import {
	AGENT_TYPES,
	type AgentType,
	buildAgentFileCommand,
	type TaskInput,
} from "./agent-command";
import {
	DEFAULT_CHAT_TASK_PROMPT_TEMPLATE,
	DEFAULT_TERMINAL_TASK_PROMPT_TEMPLATE,
	renderTaskPromptTemplate,
} from "./agent-prompt-template";

export const STARTABLE_AGENT_TYPES = BUILTIN_AGENT_IDS;

export type StartableAgentType = (typeof STARTABLE_AGENT_TYPES)[number];

export const STARTABLE_AGENT_LABELS = BUILTIN_AGENT_LABELS;

export const AGENT_LAUNCH_STATUS = [
	"queued",
	"launching",
	"running",
	"failed",
] as const;

export type AgentLaunchStatus = (typeof AGENT_LAUNCH_STATUS)[number];

export const AGENT_LAUNCH_SOURCE = [
	"new-workspace",
	"open-in-workspace",
	"workspace-init",
	"command-watcher",
	"mcp",
	"unknown",
] as const;

export type AgentLaunchSource = (typeof AGENT_LAUNCH_SOURCE)[number];

const launchSourceSchema = z.enum(AGENT_LAUNCH_SOURCE);

const baseAgentLaunchSchema = z.object({
	workspaceId: z.string().min(1),
	idempotencyKey: z.string().min(1).optional(),
	agentType: z.string().min(1).optional(),
	source: launchSourceSchema.optional(),
});

export const terminalLaunchConfigSchema = z.object({
	command: z.string().min(1),
	name: z.string().min(1).optional(),
	paneId: z.string().min(1).optional(),
	taskPromptContent: z.string().min(1).optional(),
	taskPromptFileName: z.string().min(1).optional(),
	autoExecute: z.boolean().optional(),
	initialFiles: z
		.array(
			z.object({
				data: z.string(),
				mediaType: z.string(),
				filename: z.string().optional(),
			}),
		)
		.optional(),
});

export const chatLaunchConfigSchema = z.object({
	paneId: z.string().min(1).optional(),
	sessionId: z.string().uuid().optional(),
	initialPrompt: z.string().min(1).optional(),
	initialFiles: z
		.array(
			z.object({
				data: z.string(),
				mediaType: z.string(),
				filename: z.string().optional(),
			}),
		)
		.optional(),
	model: z.string().min(1).optional(),
	retryCount: z.number().int().min(0).max(10).optional(),
	autoExecute: z.boolean().optional(),
	taskSlug: z.string().min(1).optional(),
});

export const terminalAgentLaunchRequestSchema = baseAgentLaunchSchema.extend({
	kind: z.literal("terminal"),
	terminal: terminalLaunchConfigSchema,
});

export const chatAgentLaunchRequestSchema = baseAgentLaunchSchema.extend({
	kind: z.literal("chat"),
	chat: chatLaunchConfigSchema,
});

export const agentLaunchRequestSchema = z.discriminatedUnion("kind", [
	terminalAgentLaunchRequestSchema,
	chatAgentLaunchRequestSchema,
]);

export type AgentLaunchRequest = z.infer<typeof agentLaunchRequestSchema>;

export const agentLaunchResultSchema = z.object({
	workspaceId: z.string().min(1),
	tabId: z.string().min(1).nullable().optional(),
	paneId: z.string().min(1).nullable().optional(),
	sessionId: z.string().uuid().nullable().optional(),
	status: z.enum(AGENT_LAUNCH_STATUS),
	error: z.string().nullable().optional(),
});

export type AgentLaunchResult = z.infer<typeof agentLaunchResultSchema>;

const legacyAgentLaunchRequestSchema = z.object({
	workspaceId: z.string().min(1),
	command: z.string().min(1).optional(),
	name: z.string().min(1).optional(),
	paneId: z.string().min(1).optional(),
	openChatPane: z.boolean().optional(),
	chatLaunchConfig: chatLaunchConfigSchema.partial().optional(),
	idempotencyKey: z.string().min(1).optional(),
	agentType: z.string().min(1).optional(),
	source: launchSourceSchema.optional(),
});

export type LegacyAgentLaunchRequest = z.infer<
	typeof legacyAgentLaunchRequestSchema
>;

export function isTerminalAgentType(agent: string): agent is AgentType {
	return (AGENT_TYPES as readonly string[]).includes(agent);
}

function normalizeLegacyLaunchRequest(
	legacy: LegacyAgentLaunchRequest,
): AgentLaunchRequest {
	const chatConfig = legacy.chatLaunchConfig;
	const shouldLaunchChat =
		legacy.agentType === "superset-chat" ||
		legacy.openChatPane === true ||
		chatConfig !== undefined;

	if (shouldLaunchChat) {
		return {
			kind: "chat",
			workspaceId: legacy.workspaceId,
			idempotencyKey: legacy.idempotencyKey,
			agentType: "superset-chat",
			source: legacy.source,
			chat: {
				paneId: chatConfig?.paneId ?? legacy.paneId,
				sessionId: chatConfig?.sessionId,
				initialPrompt: chatConfig?.initialPrompt,
				model: chatConfig?.model,
				retryCount: chatConfig?.retryCount,
			},
		};
	}

	if (!legacy.command) {
		throw new Error(
			"Invalid launch request: missing terminal command or chat launch config",
		);
	}

	return {
		kind: "terminal",
		workspaceId: legacy.workspaceId,
		idempotencyKey: legacy.idempotencyKey,
		agentType: legacy.agentType,
		source: legacy.source,
		terminal: {
			command: legacy.command,
			name: legacy.name,
			paneId: legacy.paneId,
		},
	};
}

/**
 * Accepts both canonical launch requests and legacy command/openChatPane params.
 * This keeps MCP and desktop callers backwards compatible during rollout.
 */
export function normalizeAgentLaunchRequest(
	request: unknown,
): AgentLaunchRequest {
	const parsed = agentLaunchRequestSchema.safeParse(request);
	if (parsed.success) {
		return parsed.data;
	}

	const legacy = legacyAgentLaunchRequestSchema.parse(request);
	return agentLaunchRequestSchema.parse(normalizeLegacyLaunchRequest(legacy));
}

/**
 * Builds an AgentLaunchRequest for a task, used when creating workspaces
 * from the issues tab, task sidebar, or batch run popover.
 */
export function buildTaskLaunchRequest({
	task,
	workspaceId,
	agentType,
	source,
	autoExecute,
}: {
	task: TaskInput;
	workspaceId: string;
	agentType: StartableAgentType;
	source: AgentLaunchSource;
	autoExecute?: boolean;
}): AgentLaunchRequest {
	if (agentType === "superset-chat") {
		return {
			kind: "chat",
			workspaceId,
			agentType: "superset-chat",
			source,
			chat: {
				initialPrompt: renderTaskPromptTemplate(
					DEFAULT_CHAT_TASK_PROMPT_TEMPLATE,
					task,
				),
				retryCount: 1,
				autoExecute,
				taskSlug: task.slug,
			},
		};
	}

	const prompt = renderTaskPromptTemplate(
		DEFAULT_TERMINAL_TASK_PROMPT_TEMPLATE,
		task,
	);
	const taskPromptFileName = `task-${task.slug}.md`;
	return {
		kind: "terminal",
		workspaceId,
		agentType,
		source,
		terminal: {
			command: buildAgentFileCommand({
				filePath: `.superset/${taskPromptFileName}`,
				agent: agentType,
			}),
			name: task.slug,
			taskPromptContent: prompt,
			taskPromptFileName,
			autoExecute,
		},
	};
}
