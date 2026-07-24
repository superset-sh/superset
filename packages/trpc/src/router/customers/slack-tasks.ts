import Anthropic from "@anthropic-ai/sdk";
import { kv } from "@vercel/kv";
import { z } from "zod";

import { env } from "../../env";
import { memoizeAsync } from "./activity-snapshot";

/**
 * Slack → customer tasks. Reads OUR OWN Slack workspace with a single internal
 * user token (no OAuth flow — this is unrelated to the customer-facing Slack
 * integration in apps/api). Channels are matched to a customer domain by an
 * explicit `customer:<domain>` tag in the channel topic/purpose, or by a name
 * convention (`ext-acme`, `acme-superset`, …). Matched channels' histories are
 * synced incrementally and Claude maintains a running task list per channel,
 * stored in KV.
 *
 * A user token reads whatever the installing user can read — every channel
 * they're in, no per-app invites. Slack still requires channel membership to
 * pull history, so matched channels the user hasn't joined are surfaced in
 * the UI rather than synced.
 */

export function isSlackConfigured(): boolean {
	return Boolean(env.SLACK_CUSTOMERS_TOKEN);
}

// ---------------------------------------------------------------------------
// Slack Web API (plain fetch — not worth a dependency for four methods)
// ---------------------------------------------------------------------------

async function slackApi<T>(
	method: string,
	params: Record<string, string> = {},
): Promise<T> {
	const search = new URLSearchParams(params).toString();
	const response = await fetch(
		`https://slack.com/api/${method}${search ? `?${search}` : ""}`,
		{
			headers: { Authorization: `Bearer ${env.SLACK_CUSTOMERS_TOKEN}` },
		},
	);
	const body = (await response.json()) as { ok: boolean; error?: string } & T;
	if (!body.ok) {
		throw new Error(`Slack API ${method} failed: ${body.error ?? "unknown"}`);
	}
	return body;
}

/** Workspace base URL, for building message permalinks. */
const getWorkspaceUrl = memoizeAsync(async () => {
	const auth = await slackApi<{ url?: string }>("auth.test");
	return (auth.url ?? "https://slack.com/").replace(/\/$/, "");
});

// ---------------------------------------------------------------------------
// Channel → domain matching
// ---------------------------------------------------------------------------

export interface SlackChannelMatch {
	channelId: string;
	name: string;
	topic: string | null;
	matchedBy: "tag" | "name";
	isMember: boolean;
}

interface SlackChannel {
	id: string;
	name: string;
	topic?: { value?: string };
	purpose?: { value?: string };
	is_member?: boolean;
	is_archived?: boolean;
}

const TAG_PATTERN = /customer:\s*([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)/i;

const listAllChannels = memoizeAsync(async () => {
	const channels: SlackChannel[] = [];
	let cursor: string | undefined;
	do {
		const page = await slackApi<{
			channels: SlackChannel[];
			response_metadata?: { next_cursor?: string };
		}>("conversations.list", {
			types: "public_channel,private_channel",
			exclude_archived: "true",
			limit: "200",
			...(cursor ? { cursor } : {}),
		});
		channels.push(...page.channels);
		cursor = page.response_metadata?.next_cursor || undefined;
	} while (cursor);
	return channels;
});

/** Channel-name conventions that imply "this channel is about <label>". */
function nameMatchesLabel(channelName: string, label: string): boolean {
	if (label.length < 3) return false;
	return [
		label,
		`ext-${label}`,
		`${label}-ext`,
		`shared-${label}`,
		`${label}-superset`,
		`superset-${label}`,
	].includes(channelName);
}

export async function getChannelsForDomain(
	domain: string,
): Promise<SlackChannelMatch[]> {
	if (!isSlackConfigured()) return [];
	const label = domain.split(".")[0] ?? "";
	const matches: SlackChannelMatch[] = [];
	for (const channel of await listAllChannels()) {
		const description = `${channel.topic?.value ?? ""}\n${channel.purpose?.value ?? ""}`;
		const tagged = TAG_PATTERN.exec(description)?.[1]?.toLowerCase();
		const matchedBy =
			tagged === domain
				? ("tag" as const)
				: nameMatchesLabel(channel.name, label)
					? ("name" as const)
					: null;
		if (matchedBy) {
			matches.push({
				channelId: channel.id,
				name: channel.name,
				topic: channel.topic?.value || null,
				matchedBy,
				isMember: channel.is_member ?? false,
			});
		}
	}
	// Explicit tags outrank name heuristics in display order.
	return matches.sort((a, b) => a.matchedBy.localeCompare(b.matchedBy));
}

// ---------------------------------------------------------------------------
// Task store (KV)
// ---------------------------------------------------------------------------

const taskSchema = z.object({
	id: z.string(),
	title: z.string(),
	status: z.enum(["open", "done"]).catch("open"),
	owner: z.enum(["us", "customer"]).nullable().catch(null),
	assignee: z.string().nullable().catch(null),
	sourceTs: z.string().nullable().catch(null),
});

export type SlackTask = z.infer<typeof taskSchema>;

export interface ChannelTaskStore {
	tasks: SlackTask[];
	/** Newest message ts already ingested — next sync reads after this. */
	cursorTs: string | null;
	syncedAt: string;
	permalinkBase: string;
}

const STORE_PREFIX = `customers:slack-tasks:${env.NODE_ENV}:channel:`;
const isKVConfigured = Boolean(env.KV_REST_API_URL && env.KV_REST_API_TOKEN);
const memoryStores = new Map<string, ChannelTaskStore>();

export async function getChannelTaskStore(
	channelId: string,
): Promise<ChannelTaskStore | null> {
	if (isKVConfigured) {
		try {
			const stored = await kv.get<ChannelTaskStore>(
				`${STORE_PREFIX}${channelId}`,
			);
			if (stored) return stored;
		} catch {
			// Fall through to memory on KV error
		}
	}
	return memoryStores.get(channelId) ?? null;
}

async function setChannelTaskStore(
	channelId: string,
	store: ChannelTaskStore,
): Promise<void> {
	if (isKVConfigured) {
		try {
			await kv.set(`${STORE_PREFIX}${channelId}`, store);
			return;
		} catch {
			// Fall through to memory on KV error
		}
	}
	memoryStores.set(channelId, store);
}

// ---------------------------------------------------------------------------
// History sync + extraction
// ---------------------------------------------------------------------------

interface SlackMessage {
	ts: string;
	text?: string;
	user?: string;
	subtype?: string;
	bot_id?: string;
}

/** First sync reads at most this far back. */
const INITIAL_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;
const HISTORY_PAGE_LIMIT = 200;

const userNameCache = new Map<string, string>();

async function resolveUserName(userId: string): Promise<string> {
	const hit = userNameCache.get(userId);
	if (hit) return hit;
	try {
		const info = await slackApi<{
			user?: { profile?: { display_name?: string; real_name?: string } };
		}>("users.info", { user: userId });
		const name =
			info.user?.profile?.display_name ||
			info.user?.profile?.real_name ||
			userId;
		userNameCache.set(userId, name);
		return name;
	} catch {
		return userId;
	}
}

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

async function extractTasks(options: {
	domain: string;
	channelName: string;
	existingTasks: SlackTask[];
	messages: string[];
}): Promise<SlackTask[]> {
	const response = await anthropic.messages.create({
		model: "claude-opus-4-8",
		max_tokens: 4000,
		messages: [
			{
				role: "user",
				content: `You maintain a task list for the Slack channel #${options.channelName}, shared between Superset (an AI coding-agent workspace product) and a customer whose email domain is ${options.domain}.

Current task list (JSON):
${JSON.stringify(options.existingTasks)}

New messages since the last sync (oldest first):
${options.messages.join("\n")}

Update the task list based on the new messages:
- Add a task for each concrete action item: bugs Superset should fix, features Superset committed to, things the customer promised to do or try, and unanswered questions that need follow-up.
- Mark an existing task "done" when the messages indicate it was resolved, shipped, or answered.
- Leave other existing tasks unchanged, keeping their original "id".
- For new tasks, use the source message timestamp as "id" and "sourceTs".
- "owner" is "us" when Superset owes the work, "customer" when they do.
- "assignee" is the person's name when clear, else null.
- Do NOT create tasks for pleasantries, status chatter, or vague discussion.

Respond with ONLY a JSON object, no markdown fences or prose:
{"tasks": [{"id": string, "title": string, "status": "open" | "done", "owner": "us" | "customer" | null, "assignee": string | null, "sourceTs": string | null}]}`,
			},
		],
	});
	const text = response.content
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join("\n");
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start === -1 || end <= start) return options.existingTasks;
	try {
		const parsed = z
			.object({ tasks: z.array(taskSchema).catch([]) })
			.safeParse(JSON.parse(text.slice(start, end + 1)));
		return parsed.success ? parsed.data.tasks : options.existingTasks;
	} catch {
		return options.existingTasks;
	}
}

function formatMessageTime(ts: string): string {
	return new Date(Number(ts) * 1000)
		.toISOString()
		.slice(0, 16)
		.replace("T", " ");
}

/**
 * Incremental sync: read messages after the stored cursor, and if there are
 * any, have Claude fold them into the channel's running task list.
 */
export async function syncChannelTasks(options: {
	channelId: string;
	channelName: string;
	domain: string;
}): Promise<ChannelTaskStore> {
	const existing = await getChannelTaskStore(options.channelId);
	const oldest =
		existing?.cursorTs ?? String((Date.now() - INITIAL_LOOKBACK_MS) / 1000);

	const history = await slackApi<{ messages: SlackMessage[] }>(
		"conversations.history",
		{
			channel: options.channelId,
			oldest,
			limit: String(HISTORY_PAGE_LIMIT),
		},
	);

	// Newest-first from Slack; keep human/bot prose, drop join/leave noise.
	const fresh = history.messages
		.filter(
			(message) =>
				message.text &&
				(!message.subtype || message.subtype === "thread_broadcast") &&
				message.ts !== existing?.cursorTs,
		)
		.reverse();

	const permalinkBase = `${await getWorkspaceUrl()}/archives/${options.channelId}`;
	const syncedAt = new Date().toISOString();

	if (fresh.length === 0) {
		const store: ChannelTaskStore = existing
			? { ...existing, syncedAt, permalinkBase }
			: { tasks: [], cursorTs: null, syncedAt, permalinkBase };
		await setChannelTaskStore(options.channelId, store);
		return store;
	}

	const lines = await Promise.all(
		fresh.map(async (message) => {
			const who = message.user
				? await resolveUserName(message.user)
				: (message.bot_id ?? "bot");
			return `[${formatMessageTime(message.ts)}] ${who}: ${message.text}`;
		}),
	);

	const tasks = await extractTasks({
		domain: options.domain,
		channelName: options.channelName,
		existingTasks: existing?.tasks ?? [],
		messages: lines,
	});

	const store: ChannelTaskStore = {
		tasks,
		cursorTs: fresh[fresh.length - 1]?.ts ?? existing?.cursorTs ?? null,
		syncedAt,
		permalinkBase,
	};
	await setChannelTaskStore(options.channelId, store);
	return store;
}
