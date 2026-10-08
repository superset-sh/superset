import { z } from "zod";
import type { VoiceUiDirective } from "./directives";

export const VOICE_REALTIME_MODEL = "gpt-realtime-2.1";
export const VOICE_VOICES = [
	"alloy",
	"ash",
	"ballad",
	"coral",
	"echo",
	"sage",
	"shimmer",
	"verse",
	"marin",
	"cedar",
] as const;
export type VoiceVoice = (typeof VOICE_VOICES)[number];
export const VOICE_DEFAULT_VOICE: VoiceVoice = "marin";
export const VOICE_REASONING_EFFORTS = [
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
] as const;
export type VoiceReasoningEffort = (typeof VOICE_REASONING_EFFORTS)[number];
export const VOICE_DEFAULT_REASONING_EFFORT: VoiceReasoningEffort = "medium";
export const VOICE_SPEEDS = [0.9, 1, 1.1, 1.25, 1.5] as const;
export const VOICE_DEFAULT_SPEED = 1;

export const voiceSessionSettingsSchema = z.object({
	voice: z.enum(VOICE_VOICES).optional(),
	reasoningEffort: z.enum(VOICE_REASONING_EFFORTS).optional(),
	speed: z.number().min(0.25).max(1.5).optional(),
});
export type VoiceSessionSettings = z.infer<typeof voiceSessionSettingsSchema>;
export const VOICE_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
/** The Realtime API ends a session at 60 minutes whatever the client does. */
export const VOICE_MAX_SESSION_SECONDS = 60 * 60;
/** How long the minted secret can sit unused before connecting. */
export const VOICE_SECRET_TTL_SECONDS = 120;
/** Conversation kept per reply, past the instructions; older turns are dropped. */
export const VOICE_CONTEXT_TOKEN_LIMIT = 6000;

export const VOICE_SHOW_SCREENS = [
	"home",
	"workspace",
	"sessions",
	"pull_requests",
	"page",
] as const;
export type VoiceShowScreen = (typeof VOICE_SHOW_SCREENS)[number];

/** Which client on the phone executes the call. */
export type VoiceToolExecutor = "api" | "host" | "local";

export interface VoiceToolDefinition<
	Name extends string = string,
	Schema extends z.ZodObject = z.ZodObject,
> {
	name: Name;
	description: string;
	parameters: Schema;
	executor: VoiceToolExecutor;
}

function defineTool<const Name extends string, Schema extends z.ZodObject>(
	tool: VoiceToolDefinition<Name, Schema>,
) {
	return tool;
}

const workspaceQuery = z
	.string()
	.min(1)
	.describe(
		"The workspace, as the user said it: a name, part of a name, or an id.",
	);

export const VOICE_TOOLS = [
	defineTool({
		name: "list_workspaces",
		description:
			"The user's workspaces with what each agent is doing. Call this for 'what are my agents up to' or when a name needs matching.",
		parameters: z.object({
			filter: z
				.enum(["active", "all"])
				.default("active")
				.describe(
					"active: workspaces with a live agent session or recent activity. all: every workspace.",
				),
			limit: z.number().int().min(1).max(20).default(10),
		}),
		executor: "api",
	}),
	defineTool({
		name: "get_workspace",
		description:
			"One workspace in detail: agent status, sessions, pull request, last activity. Resolves a spoken name; ask the user if it returns several candidates.",
		parameters: z.object({ query: workspaceQuery }),
		executor: "api",
	}),
	defineTool({
		name: "list_sessions",
		description:
			"The agent and terminal sessions running in a workspace, with what each needs from the user.",
		parameters: z.object({ workspace: workspaceQuery }),
		executor: "host",
	}),
	defineTool({
		name: "read_session",
		description:
			"The tail of an agent session's terminal output, as text. Use it to say what the agent did last and what it is waiting on.",
		parameters: z.object({
			workspace: workspaceQuery,
			session: z
				.string()
				.optional()
				.describe(
					"Session name or agent, e.g. 'claude'. Omit for the most recently active one.",
				),
			maxChars: z.number().int().min(500).max(8000).default(1500),
		}),
		executor: "host",
	}),
	defineTool({
		name: "list_pull_requests",
		description:
			"Pull requests opened from a workspace: number, title, checks, review state.",
		parameters: z.object({ workspace: workspaceQuery }),
		executor: "api",
	}),
	defineTool({
		name: "list_pages",
		description:
			"Pages agents have published: dashboards, reports, previews. Optionally only one workspace's.",
		parameters: z.object({
			workspace: workspaceQuery.optional(),
			limit: z.number().int().min(1).max(20).default(10),
		}),
		executor: "api",
	}),
	defineTool({
		name: "open_page",
		description:
			"Open a published page on the phone. Accepts a page id, slug, or title fragment.",
		parameters: z.object({ page: z.string().min(1) }),
		executor: "api",
	}),
	defineTool({
		name: "read_page",
		description:
			"The text of a published page, to answer questions about what it says. Omit page to read the one on screen.",
		parameters: z.object({
			page: z
				.string()
				.optional()
				.describe("Page id, slug, or title fragment. Omit for the open page."),
			maxChars: z.number().int().min(500).max(8000).default(3000),
		}),
		executor: "api",
	}),
	defineTool({
		name: "show",
		description:
			"Navigate the phone to a screen because the user asked to see it.",
		parameters: z.object({
			screen: z.enum(VOICE_SHOW_SCREENS),
			workspace: workspaceQuery.optional(),
			page: z
				.string()
				.optional()
				.describe("For screen=page: id, slug, or title."),
		}),
		executor: "local",
	}),
	defineTool({
		name: "create_workspace",
		description:
			"Delegate work to a new agent in a new workspace. By default it runs on the user's machine without a git worktree: in a scratch folder when no project is named, or in the project's own checkout when one is. Set cloud for a cloud sandbox. Answers with candidates when a machine, project or environment is ambiguous.",
		parameters: z.object({
			prompt: z
				.string()
				.min(1)
				.max(4000)
				.describe("What the agent should do, as a clear instruction."),
			project: z
				.string()
				.optional()
				.describe(
					"Project name, as the user said it. Omit for research or anything not tied to a repository.",
				),
			machine: z
				.string()
				.optional()
				.describe("Machine name, only when the user has more than one online."),
			cloud: z
				.boolean()
				.default(false)
				.describe("Run in a cloud sandbox instead of on a machine."),
			environment: z
				.string()
				.optional()
				.describe("Cloud only: environment name or part of it."),
			agent: z.string().default("claude").describe("Agent to launch."),
		}),
		executor: "host",
	}),
	defineTool({
		name: "start_agent",
		description:
			"Launch a new agent session in an existing workspace with a prompt.",
		parameters: z.object({
			workspace: workspaceQuery,
			prompt: z
				.string()
				.min(1)
				.max(4000)
				.describe("What the agent should do, as a clear instruction."),
			agent: z.string().default("claude").describe("Agent to launch."),
		}),
		executor: "host",
	}),
	defineTool({
		name: "stop_agent",
		description:
			"Stop an agent: close its session in a workspace. The session and whatever is running in it end.",
		parameters: z.object({
			workspace: workspaceQuery,
			session: z
				.string()
				.optional()
				.describe(
					"Session name or agent. Omit for the most recently active one.",
				),
		}),
		executor: "host",
	}),
	defineTool({
		name: "create_task",
		description:
			"Record a task to track work for later. Does not start any work.",
		parameters: z.object({
			title: z.string().min(1).max(200),
			description: z.string().max(4000).optional(),
			priority: z
				.enum(["urgent", "high", "medium", "low", "none"])
				.default("none"),
		}),
		executor: "api",
	}),
	defineTool({
		name: "list_tasks",
		description: "Tasks in the organization, newest first.",
		parameters: z.object({
			mine: z
				.boolean()
				.default(true)
				.describe("Only tasks assigned to the user."),
			search: z.string().optional().describe("Words from the title."),
			limit: z.number().int().min(1).max(20).default(10),
		}),
		executor: "api",
	}),
	defineTool({
		name: "end_session",
		description:
			"End this voice session and turn yourself off. Call it when the user says they are done, says goodbye, or asks you to stop listening. Say a short goodbye in the same turn.",
		parameters: z.object({}),
		executor: "local",
	}),
	defineTool({
		name: "send_message",
		description:
			"Send a message to an agent session, as if the user typed it into that terminal.",
		parameters: z.object({
			workspace: workspaceQuery,
			session: z
				.string()
				.optional()
				.describe(
					"Session name or agent. Omit for the most recently active one.",
				),
			text: z.string().min(1).max(4000),
		}),
		executor: "host",
	}),
	defineTool({
		name: "restart_workspace",
		description: "Restart a cloud workspace's sandbox.",
		parameters: z.object({ workspace: workspaceQuery }),
		executor: "api",
	}),
] as const;

export type VoiceTool = (typeof VOICE_TOOLS)[number];
export type VoiceToolName = VoiceTool["name"];
export type VoiceToolInput<Name extends VoiceToolName> = z.infer<
	Extract<VoiceTool, { name: Name }>["parameters"]
>;

export const VOICE_TOOL_NAMES = VOICE_TOOLS.map(
	(tool) => tool.name,
) as readonly VoiceToolName[];

export function voiceTool<Name extends VoiceToolName>(
	name: Name,
): Extract<VoiceTool, { name: Name }> {
	const tool = VOICE_TOOLS.find((candidate) => candidate.name === name);
	if (!tool) throw new Error(`Unknown voice tool: ${name}`);
	return tool as Extract<VoiceTool, { name: Name }>;
}

export function isVoiceToolName(value: unknown): value is VoiceToolName {
	return (
		typeof value === "string" &&
		(VOICE_TOOL_NAMES as readonly string[]).includes(value)
	);
}

/** A function tool as the Realtime session config wants it. */
export interface RealtimeFunctionTool {
	type: "function";
	name: string;
	description: string;
	parameters: Record<string, unknown>;
}

export function realtimeToolDefinitions(): RealtimeFunctionTool[] {
	return VOICE_TOOLS.map((tool) => {
		const { $schema: _schema, ...parameters } = z.toJSONSchema(
			tool.parameters,
			{ target: "draft-7" },
		);
		return {
			type: "function",
			name: tool.name,
			description: tool.description,
			parameters,
		};
	});
}

/** What an executor hands back: the model reads `output`, the phone applies `ui`. */
export interface VoiceToolResult {
	output: unknown;
	ui?: VoiceUiDirective;
}
