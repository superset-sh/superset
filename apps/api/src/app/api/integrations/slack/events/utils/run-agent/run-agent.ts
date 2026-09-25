import Anthropic from "@anthropic-ai/sdk";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { WebClient } from "@slack/web-api";
import { env } from "@/env";
import { DEFAULT_SLACK_MODEL } from "../../../constants";
import type { AgentAction } from "../slack-blocks";
import { createSlackClient } from "../slack-client";
import type { SlackImageAsset } from "../slack-image-assets";
import {
	createSupersetMcpClient,
	mcpToolToAnthropicTool,
	parseToolName,
} from "./mcp-clients";
import {
	callPluginTool,
	loadPluginTools,
	type ToolCallResult,
} from "./plugin-tools";

/**
 * Collect unique Slack user IDs from `<@U...>` mentions in text,
 * resolve them via `users.info`, and return a replacer function.
 */
export async function resolveUserMentions({
	texts,
	slack,
}: {
	texts: string[];
	slack: WebClient;
}): Promise<(text: string) => string> {
	const userIds = new Set<string>();
	for (const text of texts) {
		for (const match of text.matchAll(/<@(U[A-Z0-9]+)>/g)) {
			if (match[1]) userIds.add(match[1]);
		}
	}

	if (userIds.size === 0) {
		return (text) => text;
	}

	const userMap = new Map<string, string>();
	await Promise.all(
		[...userIds].map(async (id) => {
			try {
				const info = await slack.users.info({ user: id });
				const name = info.user?.real_name || info.user?.name || info.user?.id;
				if (name) {
					userMap.set(id, name);
				}
			} catch (error) {
				console.warn(`[slack-agent] Failed to resolve user ${id}:`, error);
			}
		}),
	);

	return (text: string) =>
		text.replace(/<@(U[A-Z0-9]+)>/g, (_, id) => `@${userMap.get(id) ?? id}`);
}

export async function fetchThreadContext({
	token,
	channelId,
	threadTs,
	messageTs,
	deadline,
	sinceTs,
	limit = 20,
}: {
	token: string;
	channelId: string;
	threadTs: string;
	messageTs: string;
	deadline?: number;
	/** The newest message the agent had already read; later ones are flagged. */
	sinceTs?: string;
	limit?: number;
}): Promise<string> {
	try {
		const slack = createSlackClient(token, { deadline });
		// Slack returns oldest first. Walk every page while retaining only the
		// latest context, bounded by the triggering message rather than "now".
		let cursor: string | undefined;
		let messages: NonNullable<
			Awaited<ReturnType<typeof slack.conversations.replies>>["messages"]
		> = [];
		const seenCursors = new Set<string>();
		do {
			const result = await slack.conversations.replies({
				channel: channelId,
				ts: threadTs,
				latest: messageTs,
				inclusive: false,
				limit: 100,
				cursor,
			});
			messages = [...messages, ...(result.messages ?? [])]
				.filter(
					(message) => message.ts && Number(message.ts) < Number(messageTs),
				)
				.slice(-limit);
			cursor = result.response_metadata?.next_cursor?.trim() || undefined;
			if (cursor && seenCursors.has(cursor))
				throw new Error("Slack repeated a pagination cursor");
			if (cursor) seenCursors.add(cursor);
		} while (cursor);
		if (messages.length === 0) return "";

		// Collect mention texts + message author IDs for resolution
		const textsToResolve = messages.flatMap((msg) => {
			const parts = [msg.text ?? ""];
			if (msg.user) parts.push(`<@${msg.user}>`);
			return parts;
		});
		const resolve = await resolveUserMentions({
			texts: textsToResolve,
			slack,
		});

		const isNew = (ts: string | undefined) =>
			sinceTs !== undefined && ts !== undefined && Number(ts) > Number(sinceTs);
		const newCount = messages.filter((msg) => isNew(msg.ts)).length;
		const formatted = messages
			.map(
				(msg) =>
					`${isNew(msg.ts) ? "[new] " : ""}${msg.user ? resolve(`<@${msg.user}>`) : "unknown"}: ${resolve(msg.text ?? "")}`,
			)
			.join("\n");

		const header =
			newCount > 0
				? `--- Thread Context (${messages.length} previous messages; ${newCount} marked [new] arrived after your last reply) ---`
				: `--- Thread Context (${messages.length} previous messages) ---`;
		return `${header}\n${formatted}\n--- End Thread Context ---`;
	} catch (error) {
		console.warn("[slack-agent] Failed to fetch thread context:", error);
		return "";
	}
}

interface RunSlackAgentParams {
	prompt: string;
	channelId: string;
	threadTs: string;
	messageTs: string;
	organizationId: string;
	userId: string;
	slackToken: string;
	model?: string;
	images?: SlackImageAsset[];
	/** Epoch ms after which no further model or tool call starts. */
	deadline?: number;
	/** What the agent already created in this thread; see renderThreadMemory. */
	threadMemory?: string;
	/**
	 * Present when the thread is a session: its current quiet state and the
	 * way to change it. Absent, the quiet tool is not offered.
	 */
	threadQuiet?: {
		quiet: boolean;
		set: (quiet: boolean) => Promise<void>;
	};
	/** The newest thread message the agent had read before this turn. */
	lastContextTs?: string;
	onProgress?: (status: string) => void | Promise<void>;
	/** Bound on listing a plugin's tools before the first model call. */
	pluginDiscoveryTimeoutMs?: number;
	/** Checked between steps; true ends the turn with the stopped copy. */
	shouldStop?: () => Promise<boolean>;
}

/** Everything after the handler's claim shares one budget (job maxDuration is 300s). */
const DEFAULT_RUN_BUDGET_MS = 240_000;
const MODEL_CALL_TIMEOUT_MS = 120_000;
const PLUGIN_DISCOVERY_TIMEOUT_MS = 15_000;

/**
 * A failure with copy already written for Slack. Never routed through the
 * Haiku error rewriter, whose prompt is meant for raw API errors.
 */
export class SlackAgentError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SlackAgentError";
	}
}

const AGENT_COPY = {
	timeLimit:
		"I ran out of time before finishing. Anything I completed is listed below; ask again for the rest.",
	turnLimit:
		"I ran out of steps before finishing. Anything I completed is listed below; ask again for the rest.",
	truncated:
		"My reply was cut off before it finished. Ask me to continue, or narrow the request. Anything I completed is listed below.",
	refusal: "I can't help with that request.",
	stopped: "Stopped. Anything I completed before that is listed below.",
	empty: "I finished without an answer to show. Ask again with more detail.",
} as const;

const RATE_LIMIT_DEFAULT_WAIT_MS = 2_000;
const RATE_LIMIT_MAX_WAIT_MS = 10_000;

/** Retry-After is delay-seconds or an HTTP-date; either becomes a bounded wait. */
export function rateLimitWaitMs(
	error: { headers?: { get?: (name: string) => string | null | undefined } },
	now = Date.now(),
): number {
	const header = error.headers?.get?.("retry-after") ?? "";
	const seconds = Number(header);
	const fromDate = Date.parse(header) - now;
	const wait =
		Number.isFinite(seconds) && seconds > 0
			? seconds * 1000
			: Number.isFinite(fromDate) && fromDate > 0
				? fromDate
				: RATE_LIMIT_DEFAULT_WAIT_MS;
	return Math.min(wait, RATE_LIMIT_MAX_WAIT_MS);
}

export interface SlackAgentResult {
	text: string;
	actions: AgentAction[];
	unconnectedPlugins: SlackPlugin[];
}

const ERROR_REWRITE_TIMEOUT_MS = 45_000;
const ERROR_REWRITE_MIN_REMAINING_MS = 20_000;
const GENERIC_ERROR_TEXT = "Sorry, something went wrong. Please try again.";

export async function formatErrorForSlack(
	error: unknown,
	deadline?: number,
): Promise<string> {
	const message =
		error instanceof Error ? error.message : "Unknown error occurred";
	const remaining =
		deadline === undefined ? ERROR_REWRITE_TIMEOUT_MS : deadline - Date.now();
	if (remaining < ERROR_REWRITE_MIN_REMAINING_MS) {
		return error instanceof Anthropic.APIError && error.status === 429
			? "I'm a bit overloaded right now — please try again in a moment."
			: GENERIC_ERROR_TEXT;
	}
	try {
		const anthropic = new Anthropic({
			apiKey: env.SERVER_ANTHROPIC_API_KEY,
			timeout: Math.min(ERROR_REWRITE_TIMEOUT_MS, remaining - 5_000),
			maxRetries: 0,
		});
		const response = await anthropic.messages.create({
			model: "claude-haiku-4-5",
			max_tokens: 256,
			messages: [
				{
					role: "user",
					content: `Rewrite this API error as a brief, friendly Slack message (1-2 sentences). No technical jargon, no JSON. If it's a rate limit, tell them to try again shortly.\n\nError: ${message}`,
				},
			],
		});
		const text = response.content.find(
			(b): b is Anthropic.TextBlock => b.type === "text",
		);
		return text?.text ?? GENERIC_ERROR_TEXT;
	} catch {
		if (error instanceof Anthropic.APIError && error.status === 429) {
			return "I'm a bit overloaded right now — please try again in a moment.";
		}
		return GENERIC_ERROR_TEXT;
	}
}

function getActionFromToolResult({
	prefix,
	toolName,
	input,
	result,
}: {
	prefix: string;
	toolName: string;
	input: Record<string, unknown>;
	result: ToolCallResult;
}): AgentAction | null {
	const data =
		(result.structuredContent as Record<string, unknown> | undefined) ??
		parseTextContent(result.content);
	if (!data) return null;

	if (prefix === "superset") return getSupersetAction(toolName, data);
	if (prefix === "linear") return getLinearAction(toolName, input, data);
	if (prefix === "github") return getGithubAction(toolName, input, data);
	return null;
}

function getSupersetAction(
	toolName: string,
	data: Record<string, unknown>,
): AgentAction | null {
	if (toolName === "tasks_create" && data.task) {
		const t = data.task as { id: string; slug: string; title: string };
		return {
			type: "task_created",
			tasks: [{ id: t.id, slug: t.slug, title: t.title, status: "Backlog" }],
		};
	}

	if (toolName === "tasks_update" && data.task) {
		const t = data.task as { id: string; slug: string; title: string };
		return {
			type: "task_updated",
			tasks: [{ id: t.id, slug: t.slug, title: t.title }],
		};
	}

	if (toolName === "workspaces_create" && data.workspace) {
		const w = data.workspace as {
			id: string;
			name: string;
			branch: string;
		};
		return {
			type: "workspace_created",
			workspaces: [{ id: w.id, name: w.name, branch: w.branch }],
		};
	}

	return null;
}

// Linear's server serialises an issue with its identifier (SUP-12) as `id`.
function getLinearAction(
	toolName: string,
	input: Record<string, unknown>,
	data: Record<string, unknown>,
): AgentAction | null {
	if (toolName !== "save_issue" || input.id !== undefined) return null;
	const issue = (data.issue ?? data) as {
		id?: unknown;
		identifier?: unknown;
		title?: unknown;
		url?: unknown;
	};
	const identifier =
		typeof issue.identifier === "string" ? issue.identifier : issue.id;
	if (
		typeof identifier !== "string" ||
		typeof issue.title !== "string" ||
		typeof issue.url !== "string"
	) {
		return null;
	}
	return {
		type: "issue_created",
		issues: [{ identifier, title: issue.title, url: issue.url }],
	};
}

// GitHub's server answers a create with `{ id, url }` only: the number is in
// the URL and the title is the one that was requested.
function getGithubAction(
	toolName: string,
	input: Record<string, unknown>,
	data: Record<string, unknown>,
): AgentAction | null {
	const url = data.url;
	if (typeof url !== "string") return null;
	const title = typeof input.title === "string" ? input.title : "";

	if (toolName === "create_pull_request") {
		const number = Number(url.match(/\/pull\/(\d+)$/)?.[1]);
		if (!number) return null;
		return { type: "pr_opened", pullRequests: [{ number, title, url }] };
	}

	if (toolName === "issue_write" && input.method === "create") {
		const match = url.match(/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)$/);
		if (!match) return null;
		return {
			type: "issue_created",
			issues: [{ identifier: `${match[1]}#${match[2]}`, title, url }],
		};
	}

	return null;
}

function parseTextContent(content: unknown): Record<string, unknown> | null {
	const first = Array.isArray(content) ? content[0] : undefined;
	if (
		!first ||
		typeof first !== "object" ||
		!("text" in first) ||
		typeof first.text !== "string"
	) {
		return null;
	}
	try {
		const parsed = JSON.parse(first.text);
		return parsed && typeof parsed === "object" ? parsed : null;
	} catch {
		return null;
	}
}

const TOOL_PROGRESS_STATUS: Record<string, string> = {
	tasks_create: "Creating task...",
	tasks_update: "Updating task...",
	tasks_delete: "Deleting task...",
	tasks_list: "Searching tasks...",
	tasks_get: "Fetching task details...",
	workspaces_create: "Creating workspace...",
	workspaces_list: "Fetching workspaces...",
	workspaces_delete: "Deleting workspace...",
	projects_list: "Fetching projects...",
	hosts_list: "Fetching hosts...",
	organization_members_list: "Fetching members...",
	tasks_statuses_list: "Fetching task statuses...",
	automations_list: "Fetching automations...",
	automations_run: "Running automation...",
	agents_list: "Fetching agents...",
	agents_create: "Launching agent...",
	// Server-side
	slack_get_channel_history: "Reading channel history...",
	slack_thread_quiet: "Updating thread settings...",
	linear_list_issues: "Searching Linear issues...",
	linear_get_issue: "Fetching Linear issue...",
	linear_save_issue: "Saving Linear issue...",
	linear_save_comment: "Commenting in Linear...",
	github_search_issues: "Searching GitHub issues...",
	github_search_pull_requests: "Searching pull requests...",
	github_search_code: "Searching code on GitHub...",
	github_issue_write: "Saving GitHub issue...",
	github_add_issue_comment: "Commenting on GitHub...",
	github_create_pull_request: "Opening pull request...",
};

// Explicit opt-in: newly added MCP tools must not silently acquire Slack access.
// Irreversible actions remain unavailable until the approval flow is wired up.
export const ALLOWED_SLACK_TOOLS = new Set([
	"tasks_list",
	"tasks_get",
	"tasks_create",
	"tasks_update",
	"workspaces_list",
	"workspaces_create",
	"projects_list",
	"agents_list",
	"agents_create",
	"terminals_list",
	"terminals_read",
	"automations_list",
	"automations_get",
	"automations_get_prompt",
	"automations_logs",
	"pages_list",
	"pages_get",
	"pages_versions",
	"pages_pull",
	"pages_comments_list",
]);

const SLACK_THREAD_QUIET_TOOL: Anthropic.Tool = {
	name: "slack_thread_quiet",
	description:
		"Change whether you answer replies in this thread without being mentioned. quiet=true: only replies that mention you reach you. quiet=false: every reply in the thread reaches you. Call it when someone asks you to only respond when mentioned, to stop replying unprompted, or to start replying freely again; then confirm in one short sentence.",
	input_schema: {
		type: "object" as const,
		properties: {
			quiet: {
				type: "boolean",
				description: "true to require mentions, false to answer every reply",
			},
		},
		required: ["quiet"],
	},
};

export interface SlackPlugin {
	name: string;
	displayName: string;
	capability: string;
	/** What still works without a connection, so a read question is not refused. */
	fallback?: string;
}

export const SLACK_PLUGINS: readonly SlackPlugin[] = [
	{
		name: "linear",
		displayName: "Linear",
		capability:
			"search and read issues, file issues, comment, and look up teams, projects, users, statuses and labels",
		fallback:
			"Superset tasks mirror this organization's Linear issues, so answer questions about Linear issues from the superset_tasks_* tools and say the answer comes from Superset's copy.",
	},
	{
		name: "github",
		displayName: "GitHub",
		capability:
			"search and read issues, pull requests and code, file or update issues, comment, and open pull requests",
	},
];

// Same opt-in rule as ALLOWED_SLACK_TOOLS, per plugin. Names are what each
// plugin's MCP server lists. save_issue and issue_write are the only way to
// file an issue on those servers and also edit one issue at a time.
export const PLUGIN_SLACK_TOOLS: Record<string, Set<string>> = {
	linear: new Set([
		"list_issues",
		"get_issue",
		"save_issue",
		"list_comments",
		"save_comment",
		"list_teams",
		"list_projects",
		"get_project",
		"list_users",
		"list_issue_statuses",
		"list_issue_labels",
	]),
	github: new Set([
		"get_me",
		"search_issues",
		"search_pull_requests",
		"search_code",
		"list_issues",
		"issue_read",
		"issue_write",
		"add_issue_comment",
		"list_pull_requests",
		"pull_request_read",
		"create_pull_request",
		"get_file_contents",
	]),
};

const EMPTY_INPUT_SCHEMA = { type: "object", properties: {} } as const;

export function mentionsPlugin(text: string, plugin: SlackPlugin): boolean {
	const name = plugin.displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(?<![\\p{L}\\p{N}])${name}(?![\\p{L}\\p{N}])`, "iu").test(
		text,
	);
}

const SLACK_GET_CHANNEL_HISTORY_TOOL: Anthropic.Tool = {
	name: "slack_get_channel_history",
	description:
		"Get recent messages from the current Slack channel. Use this to understand what the team has been discussing.",
	input_schema: {
		type: "object" as const,
		properties: {
			limit: {
				type: "number",
				description: "Number of messages to retrieve (default 20, max 100)",
			},
		},
		required: [],
	},
};

async function handleGetChannelHistory({
	token,
	channelId,
	deadline,
	limit = 20,
}: {
	token: string;
	channelId: string;
	deadline?: number;
	limit?: number;
}): Promise<string> {
	const slack = createSlackClient(token, { deadline });
	const result = await slack.conversations.history({
		channel: channelId,
		limit: Math.min(limit, 100),
	});

	if (!result.messages || result.messages.length === 0) {
		return JSON.stringify({ messages: [] });
	}

	const textsToResolve = result.messages.flatMap((msg) => {
		const parts = [msg.text ?? ""];
		if (msg.user) parts.push(`<@${msg.user}>`);
		return parts;
	});
	const resolve = await resolveUserMentions({
		texts: textsToResolve,
		slack,
	});

	const messages = result.messages.map((msg) => ({
		user: msg.user ? resolve(`<@${msg.user}>`) : msg.user,
		text: msg.text ? resolve(msg.text) : msg.text,
		ts: msg.ts,
		thread_ts: msg.thread_ts,
	}));

	return JSON.stringify({ messages });
}

const SYSTEM_PROMPT = `You are a helpful assistant in Slack for Superset, a platform for managing tasks and running coding agents in workspaces.

You can:
- Create, search and update tasks using superset_* tools (deleting tasks is not available from Slack)
- Spawn workspaces and launch coding agents to do the work using superset_* tools
- Read recent channel messages using slack_get_channel_history
- Search the web for current information using web_search
- Help users understand conversations and create actionable items from discussions

Guidelines:
- Be concise and clear (this is Slack, not email)
- Default to taking action when intent is clear — for requests that involve code changes, prefer spawning a workspace and agent over just filing a task, and only ask for clarification when the request is genuinely ambiguous
- When creating tasks, extract key details from the conversation
- Use standard Markdown: **bold**, _italic_, \`code\`, > quotes
- If an action fails, explain what went wrong and suggest alternatives
- When answering questions that need up-to-date info, use web_search to find current information
- Cite sources when sharing information from web search results

Context gathering:
- Thread context is automatically included if the mention is in a thread
- Use slack_get_channel_history to read recent channel messages for additional context
- Don't ask the user for context you can find yourself - be proactive`;

type McpRequestOptions = NonNullable<Parameters<Client["callTool"]>[2]>;

async function fetchAgentContext({
	mcpClient,
	userId,
	requestOptions,
}: {
	mcpClient: Client;
	userId: string;
	requestOptions: () => McpRequestOptions;
}): Promise<string> {
	const [membersResult, statusesResult, hostsResult] = await Promise.all([
		mcpClient.callTool(
			{ name: "organization_members_list", arguments: {} },
			undefined,
			requestOptions(),
		),
		mcpClient.callTool(
			{ name: "tasks_statuses_list", arguments: {} },
			undefined,
			requestOptions(),
		),
		mcpClient.callTool(
			{ name: "hosts_list", arguments: {} },
			undefined,
			requestOptions(),
		),
	]);

	const sections: string[] = [];

	const membersData = membersResult.structuredContent as {
		members: { id: string; name: string | null; email: string }[];
	} | null;
	if (membersData?.members?.length) {
		const currentUser = membersData.members.find((m) => m.id === userId);
		if (currentUser) {
			sections.push(
				`Current user: ${currentUser.name ?? currentUser.email} (id: ${currentUser.id}, email: ${currentUser.email})`,
			);
		}

		const lines = membersData.members.map(
			(m) => `- ${m.name ?? m.email} (id: ${m.id}, email: ${m.email})`,
		);
		sections.push(`Team members:\n${lines.join("\n")}`);
	}

	const statusesData = statusesResult.structuredContent as {
		statuses: { id: string; name: string; type: string }[];
	} | null;
	if (statusesData?.statuses?.length) {
		const lines = statusesData.statuses.map(
			(s) => `- ${s.name} (id: ${s.id}, type: ${s.type})`,
		);
		sections.push(`Task statuses:\n${lines.join("\n")}`);
	}

	// hosts_list returns a bare array, which the SDK wraps as `{ result }`.
	const hostsData = hostsResult.structuredContent as {
		result: { id: string; name: string; online: boolean }[];
	} | null;
	if (hostsData?.result?.length) {
		const lines = hostsData.result.map(
			(h) => `- ${h.name} (id: ${h.id}, online: ${h.online ? "yes" : "no"})`,
		);
		sections.push(`Hosts:\n${lines.join("\n")}`);
	}

	return sections.join("\n\n");
}

function buildUserMessageContent({
	prompt,
	threadContext,
	threadMemory,
	images,
}: {
	prompt: string;
	threadContext: string;
	threadMemory: string | undefined;
	images: SlackImageAsset[] | undefined;
}): string | Anthropic.ContentBlockParam[] {
	const preamble = [threadMemory, threadContext].filter(Boolean).join("\n\n");
	const textContent = preamble
		? `${preamble}\n\nCurrent message:\n${prompt}`
		: prompt;

	if (!images || images.length === 0) {
		return textContent;
	}

	const content: Anthropic.ContentBlockParam[] = [];
	if (textContent.trim().length > 0) {
		content.push({ type: "text", text: textContent });
	}

	for (const image of images) {
		content.push({
			type: "image",
			source: {
				type: "base64",
				media_type: image.mediaType,
				data: image.base64Data,
			},
		});
	}

	return content;
}

export async function runSlackAgent(
	params: RunSlackAgentParams,
): Promise<SlackAgentResult> {
	const anthropic = new Anthropic({
		apiKey: env.SERVER_ANTHROPIC_API_KEY,
		timeout: MODEL_CALL_TIMEOUT_MS,
		maxRetries: 1,
	});
	const actions: AgentAction[] = [];
	let unconnectedPlugins: SlackPlugin[] = [...SLACK_PLUGINS];
	const deadline = params.deadline ?? Date.now() + DEFAULT_RUN_BUDGET_MS;
	const remainingBudget = (): number => {
		const remaining = deadline - Date.now();
		if (remaining <= 0) throw new SlackAgentError(AGENT_COPY.timeLimit);
		return remaining;
	};
	const mcpRequestOptions = (): McpRequestOptions => ({
		timeout: remainingBudget(),
	});
	const pluginSignal = (): AbortSignal =>
		AbortSignal.timeout(remainingBudget());
	// Discovery runs before the first model call. A hung plugin endpoint must
	// cost that plugin, not the whole turn.
	const discoverySignal = (): AbortSignal =>
		AbortSignal.timeout(
			Math.min(
				remainingBudget(),
				params.pluginDiscoveryTimeoutMs ?? PLUGIN_DISCOVERY_TIMEOUT_MS,
			),
		);

	let supersetMcp: Client | null = null;
	let cleanupSuperset: (() => Promise<void>) | null = null;
	let closePlugins: (() => Promise<void>) | null = null;

	try {
		const [threadContext, supersetMcpResult] = await Promise.all([
			fetchThreadContext({
				token: params.slackToken,
				channelId: params.channelId,
				threadTs: params.threadTs,
				messageTs: params.messageTs,
				deadline,
				sinceTs: params.lastContextTs,
			}),
			createSupersetMcpClient({
				organizationId: params.organizationId,
				userId: params.userId,
			}),
		]);

		supersetMcp = supersetMcpResult.client;
		cleanupSuperset = supersetMcpResult.cleanup;

		const [supersetToolsResult, agentContext, pluginLoad] = await Promise.all([
			supersetMcp.listTools(undefined, mcpRequestOptions()),
			fetchAgentContext({
				mcpClient: supersetMcp,
				userId: params.userId,
				requestOptions: mcpRequestOptions,
			}),
			loadPluginTools({
				userId: params.userId,
				organizationId: params.organizationId,
				pluginNames: Object.keys(PLUGIN_SLACK_TOOLS),
				signal: discoverySignal(),
			}),
		]);
		closePlugins = pluginLoad.close;
		const pluginToolSets = pluginLoad.sets;
		// Unresolved connections are unknown, not absent: no Connect prompt and
		// no "not connected" line on a transient failure.
		unconnectedPlugins = pluginLoad.resolved
			? SLACK_PLUGINS.filter((plugin) => !pluginToolSets.has(plugin.name))
			: [];

		const supersetTools = supersetToolsResult.tools
			.filter((t) => ALLOWED_SLACK_TOOLS.has(t.name))
			.map((t) => mcpToolToAnthropicTool(t, "superset"));
		const curatedPluginTools = new Map(
			[...pluginToolSets.entries()].map(([pluginName, { tools: listed }]) => [
				pluginName,
				listed
					.filter((t) => PLUGIN_SLACK_TOOLS[pluginName]?.has(t.name))
					.map((t) =>
						mcpToolToAnthropicTool(
							{ ...t, inputSchema: t.inputSchema ?? EMPTY_INPUT_SCHEMA },
							pluginName,
						),
					),
			]),
		);
		const pluginTools = [...curatedPluginTools.values()].flat();

		const model = params.model ?? DEFAULT_SLACK_MODEL;
		// Haiku 4.5 only supports the basic web search tool; the 4.6+ models take
		// the dynamic-filtering variant.
		const webSearchTool = {
			type:
				model === "claude-haiku-4-5"
					? "web_search_20250305"
					: "web_search_20260209",
			name: "web_search",
			max_uses: 5,
		} as unknown as Anthropic.Messages.ToolUnion;
		const tools: Anthropic.Messages.ToolUnion[] = [
			...supersetTools,
			...pluginTools,
			SLACK_GET_CHANNEL_HISTORY_TOOL,
			...(params.threadQuiet ? [SLACK_THREAD_QUIET_TOOL] : []),
			webSearchTool,
		];

		const threadState = params.threadQuiet
			? params.threadQuiet.quiet
				? "\n- This thread is quiet: only replies that mention you reach you. If asked to respond without mentions again, call slack_thread_quiet with quiet=false. People can also type !unmute."
				: "\n- This thread is open: every reply in it reaches you without a mention. If asked to only respond when mentioned, call slack_thread_quiet with quiet=true. People can also type !mute."
			: "";
		const integrationLines = SLACK_PLUGINS.flatMap((plugin) => {
			if (curatedPluginTools.get(plugin.name)?.length) {
				return [
					`- ${plugin.displayName} is connected: ${plugin.capability} with the ${plugin.name}_* tools`,
				];
			}
			if (pluginToolSets.has(plugin.name)) {
				return [
					`- ${plugin.displayName} is connected but its tools could not be loaded for this run. Say so if the request needs ${plugin.displayName}.`,
				];
			}
			if (!pluginLoad.resolved) {
				return mentionsPlugin(params.prompt, plugin)
					? [
							`- ${plugin.displayName} could not be checked this run. If the request needs ${plugin.displayName}, say it is unavailable right now rather than not connected.`,
						]
					: [];
			}
			if (mentionsPlugin(params.prompt, plugin)) {
				return [
					`- ${plugin.displayName} is not connected to this user's Superset account, so there are no ${plugin.name}_* tools.${plugin.fallback ? ` ${plugin.fallback}` : ""} For anything that needs ${plugin.displayName} itself, say it is not connected instead of guessing; they can connect it from the Plugins page in Superset.`,
				];
			}
			return [];
		});

		const contextualSystem = `Current context:
- Slack Channel: ${params.channelId}
- Thread: ${params.threadTs}
- Organization ID: ${params.organizationId}${threadState}
${integrationLines.length > 0 ? `\nIntegrations:\n${integrationLines.join("\n")}\n` : ""}
${agentContext}`;

		const userContent = buildUserMessageContent({
			prompt: params.prompt,
			threadContext,
			threadMemory: params.threadMemory,
			images: params.images,
		});

		const messages: Anthropic.MessageParam[] = [
			{
				role: "user",
				content: userContent,
			},
		];

		const stopIfRequested = async () => {
			if (await params.shouldStop?.()) {
				throw new SlackAgentError(AGENT_COPY.stopped);
			}
		};
		const request = async () => {
			await stopIfRequested();
			const remaining = deadline - Date.now();
			if (remaining <= 0) throw new SlackAgentError(AGENT_COPY.timeLimit);
			return anthropic.messages.create(
				{
					model,
					// A Slack turn is a short reply or a tool call. 8192 non-streamed
					// tokens took longer than the 120s request timeout and burned the
					// whole budget on a retry of the same generation.
					max_tokens: 4096,
					system: [
						{
							type: "text",
							text: SYSTEM_PROMPT,
							cache_control: { type: "ephemeral" },
						},
						{
							type: "text",
							text: contextualSystem,
						},
					],
					...([
						"claude-sonnet-5",
						"claude-sonnet-4-6",
						"claude-opus-5",
						"claude-opus-4-8",
					].includes(model)
						? { thinking: { type: "adaptive" as const } }
						: {}),
					tools,
					messages,
				},
				{
					timeout: Math.min(MODEL_CALL_TIMEOUT_MS, remaining),
					maxRetries: 0,
				},
			);
		};
		// Retry once for 429/5xx/connection errors when the budget can absorb
		// a second attempt. A timeout is not retried: a generation that took
		// longer than the request timeout takes just as long the second time.
		const requestWithRetry = async () => {
			try {
				return await request();
			} catch (error) {
				if (!(error instanceof Anthropic.APIError)) throw error;
				const retryable =
					error instanceof Anthropic.APIConnectionError
						? !(error instanceof Anthropic.APIConnectionTimeoutError)
						: error.status === 429 || (error.status ?? 0) >= 500;
				if (!retryable) throw error;
				const wait = error.status === 429 ? rateLimitWaitMs(error) : 0;
				if (deadline - Date.now() - wait < MODEL_CALL_TIMEOUT_MS) throw error;
				if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
				return request();
			}
		};
		let response = await requestWithRetry();

		const MAX_TOOL_ITERATIONS = 10;
		let iterations = 0;

		while (
			(response.stop_reason === "tool_use" ||
				response.stop_reason === "pause_turn") &&
			iterations < MAX_TOOL_ITERATIONS
		) {
			iterations++;

			// pause_turn: server-side tool (web search) paused a long-running turn
			if (response.stop_reason === "pause_turn") {
				try {
					await params.onProgress?.("Searching the web...");
				} catch {
					// Non-critical
				}
				messages.push({ role: "assistant", content: response.content });
				response = await requestWithRetry();
				continue;
			}

			// tool_use: handle client-side tools (MCP + slack_get_channel_history)
			const toolUseBlocks = response.content.filter(
				(b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
			);

			const toolResults: Anthropic.ToolResultBlockParam[] = [];

			for (const toolUse of toolUseBlocks) {
				// Per tool, not per batch: a stop that lands during one tool call
				// must not let the next one create a task or launch an agent.
				await stopIfRequested();
				if (Date.now() >= deadline)
					throw new SlackAgentError(AGENT_COPY.timeLimit);
				try {
					const { prefix, toolName } = parseToolName(toolUse.name);
					const plugin = SLACK_PLUGINS.find((p) => p.name === prefix);
					const progressStatus =
						TOOL_PROGRESS_STATUS[toolUse.name] ??
						(plugin
							? `Working in ${plugin.displayName}...`
							: (TOOL_PROGRESS_STATUS[toolName] ?? "Working..."));

					try {
						await params.onProgress?.(progressStatus);
					} catch {
						// Non-critical: don't fail the agent if progress update fails
					}

					let resultContent: string;

					if (toolUse.name === "slack_get_channel_history") {
						const input = toolUse.input as { limit?: number };
						resultContent = await handleGetChannelHistory({
							token: params.slackToken,
							channelId: params.channelId,
							deadline,
							limit: input.limit,
						});
					} else if (
						toolUse.name === "slack_thread_quiet" &&
						params.threadQuiet
					) {
						const quiet = (toolUse.input as { quiet?: unknown }).quiet === true;
						await params.threadQuiet.set(quiet);
						params.threadQuiet.quiet = quiet;
						resultContent = JSON.stringify({ quiet });
					} else {
						const input = toolUse.input as Record<string, unknown>;
						const pluginSet = pluginToolSets.get(prefix);
						let result: ToolCallResult;

						if (
							prefix === "superset" &&
							supersetMcp &&
							ALLOWED_SLACK_TOOLS.has(toolName)
						) {
							result = await supersetMcp.callTool(
								{ name: toolName, arguments: input },
								undefined,
								mcpRequestOptions(),
							);
						} else if (pluginSet && PLUGIN_SLACK_TOOLS[prefix]?.has(toolName)) {
							result = await callPluginTool({
								context: pluginSet.context,
								tool: toolName,
								args: input,
								signal: pluginSignal(),
							});
						} else {
							toolResults.push({
								type: "tool_result",
								tool_use_id: toolUse.id,
								content: JSON.stringify({
									error: `Unknown tool: ${toolUse.name}`,
								}),
								is_error: true,
							});
							continue;
						}

						resultContent = JSON.stringify(result.content);

						if (result.isError) {
							toolResults.push({
								type: "tool_result",
								tool_use_id: toolUse.id,
								content: resultContent,
								is_error: true,
							});
							continue;
						}
						const action = getActionFromToolResult({
							prefix,
							toolName,
							input,
							result,
						});
						if (action) {
							actions.push(action);
						}
					}

					toolResults.push({
						type: "tool_result",
						tool_use_id: toolUse.id,
						content: resultContent,
					});
				} catch (error) {
					console.error(
						"[slack-agent] Tool execution error:",
						toolUse.name,
						error,
					);
					toolResults.push({
						type: "tool_result",
						tool_use_id: toolUse.id,
						content: JSON.stringify({
							error:
								error instanceof Error
									? error.message
									: "Tool execution failed",
						}),
						is_error: true,
					});
				}
			}

			messages.push({
				role: "assistant",
				content: response.content,
			});
			messages.push({ role: "user", content: toolResults });

			response = await requestWithRetry();
		}

		// Never report an unfinished tool plan or truncated text as completed work.
		// Preserve completed actions so the handler can still report their links.
		if (response.stop_reason !== "end_turn") {
			const text =
				response.stop_reason === "refusal"
					? AGENT_COPY.refusal
					: response.stop_reason === "max_tokens"
						? AGENT_COPY.truncated
						: AGENT_COPY.turnLimit;
			return { text, actions, unconnectedPlugins };
		}
		// Web search splits one paragraph into several text blocks around its
		// citations: the block after a cited block continues its sentence.
		// A block after an uncited one (a preamble before a search) is a
		// new paragraph.
		const text = response.content
			.filter((block): block is Anthropic.TextBlock => block.type === "text")
			.reduce(
				(joined, block, i, blocks) =>
					i === 0
						? block.text
						: joined +
							(blocks[i - 1]?.citations?.length ? "" : "\n\n") +
							block.text,
				"",
			);
		return { text: text || AGENT_COPY.empty, actions, unconnectedPlugins };
	} catch (error) {
		console.error("[slack-agent] Agent request failed", error);
		const text =
			error instanceof SlackAgentError
				? error.message
				: await formatErrorForSlack(error, deadline);
		return { text, actions, unconnectedPlugins };
	} finally {
		if (cleanupSuperset) {
			try {
				await cleanupSuperset();
			} catch {}
		}
		if (closePlugins) {
			try {
				await closePlugins();
			} catch {}
		}
	}
}
