import { timingSafeEqual } from "node:crypto";
import { LinearClient } from "@linear/sdk";
import {
	ChannelType,
	Client,
	Events,
	GatewayIntentBits,
	type Message,
	type ThreadChannel,
} from "discord.js";
import { env } from "./env";

const linear = new LinearClient({ apiKey: env.LINEAR_API_KEY });

let teamId: string;
let sourceLabelId: string | undefined;

async function resolveLinearIds() {
	const teams = await linear.teams({
		filter: { key: { eq: env.LINEAR_TEAM_KEY } },
	});
	const team = teams.nodes[0];
	if (!team) throw new Error(`Linear team ${env.LINEAR_TEAM_KEY} not found`);
	teamId = team.id;

	const labels = await team.labels({
		filter: { name: { eq: env.LINEAR_SOURCE_LABEL } },
	});
	sourceLabelId = labels.nodes[0]?.id;
	if (!sourceLabelId) {
		throw new Error(
			`Label "${env.LINEAR_SOURCE_LABEL}" not found on team ${env.LINEAR_TEAM_KEY}`,
		);
	}
}

function issueTitle(content: string, fallback: string): string {
	const firstLine =
		content
			.split("\n")
			.find((l) => l.trim().length > 0)
			?.trim() ?? "";
	if (!firstLine) return fallback;
	return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}

async function fileIssue(opts: {
	title: string;
	content: string;
	authorTag: string;
	messageUrl: string;
}): Promise<{ identifier: string; url: string } | undefined> {
	// No stateId: API-created issues default into Triage.
	const payload = await linear.createIssue({
		teamId,
		title: opts.title,
		description: `${opts.content}\n\n---\nReported by **${opts.authorTag}** in Discord: ${opts.messageUrl}`,
		labelIds: sourceLabelId ? [sourceLabelId] : undefined,
	});
	const issue = await payload.issue;
	if (!issue) return undefined;
	return { identifier: issue.identifier, url: issue.url };
}

const discord = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
	],
});

async function handleChannelMessage(message: Message) {
	const issue = await fileIssue({
		title: issueTitle(
			message.content,
			`Discord report from ${message.author.tag}`,
		),
		content: message.content,
		authorTag: message.author.tag,
		messageUrl: message.url,
	});
	if (!issue) return;
	const thread = await message.startThread({ name: issue.identifier });
	await thread.send(
		`Filed to Linear Triage as [${issue.identifier}](${issue.url})`,
	);
}

// Forum posts arrive as new threads; the starter message may lag thread creation.
async function handleForumPost(thread: ThreadChannel) {
	const starter = await thread.fetchStarterMessage().catch(() => null);
	const content = starter?.content ?? "";
	const issue = await fileIssue({
		title: thread.name || issueTitle(content, "Discord forum post"),
		content,
		authorTag: starter?.author.tag ?? "unknown",
		messageUrl: starter?.url ?? thread.url,
	});
	if (!issue) return;
	await thread.send(
		`Filed to Linear Triage as [${issue.identifier}](${issue.url})`,
	);
}

discord.on(Events.MessageCreate, (message) => {
	if (message.author.bot) return;
	if (!env.DISCORD_CHANNEL_IDS.includes(message.channelId)) return;
	if (message.channel.type !== ChannelType.GuildText) return;
	// Replies are follow-up discussion, not new reports.
	if (message.reference) return;
	handleChannelMessage(message).catch((err) =>
		console.error("failed to file issue", err),
	);
});

discord.on(Events.ThreadCreate, (thread) => {
	if (thread.parent?.type !== ChannelType.GuildForum) return;
	if (!thread.parentId || !env.DISCORD_CHANNEL_IDS.includes(thread.parentId))
		return;
	handleForumPost(thread).catch((err) =>
		console.error("failed to file forum issue", err),
	);
});

discord.once(Events.ClientReady, (client) => {
	console.log(
		`discord-triage ready as ${client.user.tag}, watching ${env.DISCORD_CHANNEL_IDS.join(", ")}`,
	);
});

const GUILD_ID = "1446776342577283114";
const THREAD_LINK = new RegExp(
	`https://discord\\.com/channels/${GUILD_ID}/(\\d+)(?:/(\\d+))?`,
	"g",
);
const CLOSED_STATE_TYPES = new Set(["completed", "canceled", "duplicate"]);
const THREAD_CHANNEL_TYPES = new Set([10, 11, 12]);

async function discordRest(
	path: string,
	init?: RequestInit,
): Promise<Response> {
	return fetch(`https://discord.com/api/v10${path}`, {
		...init,
		headers: {
			Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
			"Content-Type": "application/json",
			...init?.headers,
		},
	});
}

type LinearWebhookPayload = {
	type?: string;
	action?: string;
	webhookTimestamp: number;
	updatedFrom?: Record<string, unknown>;
	data?: {
		identifier?: string;
		description?: string;
		state?: { type?: string; name?: string };
	};
};

// On issue close (Done/Canceled/Duplicate), reply in + archive the linked Discord threads.
async function handleIssueClosed(payload: LinearWebhookPayload) {
	const issue = payload.data;
	if (!issue) return;
	// Message links are /channels/<guild>/<channel>/<message>. For forum posts the
	// channel segment IS the thread; for text channels the thread shares the
	// message's ID. Try both segments and let the type check below disambiguate.
	const candidateIds = new Set<string>();
	for (const m of String(issue.description ?? "").matchAll(THREAD_LINK)) {
		if (m[1]) candidateIds.add(m[1]);
		if (m[2]) candidateIds.add(m[2]);
	}
	if (candidateIds.size === 0) return;
	const done = issue.state?.type === "completed";
	const message = done
		? `✅ Fixed — closed in Linear as **${issue.identifier}** (${issue.state?.name}).`
		: `Closed in Linear as **${issue.identifier}** (${issue.state?.name}).`;
	for (const threadId of candidateIds) {
		const t = await discordRest(`/channels/${threadId}`);
		if (!t.ok) continue;
		const thread = (await t.json()) as {
			type?: number;
			guild_id?: string;
			thread_metadata?: { archived?: boolean };
		};
		if (!THREAD_CHANNEL_TYPES.has(thread.type ?? -1)) continue;
		if (thread.guild_id !== GUILD_ID) continue;
		if (thread.thread_metadata?.archived) continue;
		const post = await discordRest(`/channels/${threadId}/messages`, {
			method: "POST",
			body: JSON.stringify({ content: message }),
		});
		if (!post.ok) {
			throw new Error(`post to thread ${threadId} failed: ${post.status}`);
		}
		const patch = await discordRest(`/channels/${threadId}`, {
			method: "PATCH",
			body: JSON.stringify({ archived: true }),
		});
		if (!patch.ok) {
			throw new Error(`archive thread ${threadId} failed: ${patch.status}`);
		}
		console.log(`archived thread ${threadId} for ${issue.identifier}`);
	}
}

async function handleLinearWebhook(req: Request): Promise<Response> {
	if (!env.LINEAR_WEBHOOK_SECRET) {
		return new Response("webhook not configured", { status: 503 });
	}
	// Verify over the exact received bytes; string round-trips can break HMAC.
	const rawBytes = new Uint8Array(await req.arrayBuffer());
	const raw = new TextDecoder().decode(rawBytes);
	const sig = req.headers.get("linear-signature") ?? "";
	const expected = new Bun.CryptoHasher("sha256", env.LINEAR_WEBHOOK_SECRET)
		.update(rawBytes)
		.digest("hex");
	if (
		sig.length !== expected.length ||
		!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
	) {
		console.warn(
			`webhook rejected: bad signature (len ${rawBytes.length}, enc ${req.headers.get("content-encoding")}, type ${req.headers.get("content-type")})`,
		);
		return new Response("bad signature", { status: 401 });
	}
	const payload = JSON.parse(raw);
	if (Math.abs(Date.now() - payload.webhookTimestamp) > 60_000) {
		console.warn("webhook rejected: stale timestamp");
		return new Response("stale", { status: 400 });
	}
	console.log(
		`webhook: ${payload.type}/${payload.action} ${payload.data?.identifier ?? ""} -> ${payload.data?.state?.name ?? ""}`,
	);
	const stateChanged =
		payload.type === "Issue" &&
		payload.action === "update" &&
		payload.updatedFrom &&
		"stateId" in payload.updatedFrom;
	if (stateChanged && CLOSED_STATE_TYPES.has(payload.data?.state?.type)) {
		// Await so failures return 5xx and Linear retries; archived threads are
		// skipped above, which keeps retries idempotent.
		try {
			await handleIssueClosed(payload);
		} catch (err) {
			console.error("webhook handling failed", err);
			return new Response("handling failed", { status: 500 });
		}
	}
	return new Response("ok");
}

Bun.serve({
	port: env.PORT,
	fetch(req) {
		const path = new URL(req.url).pathname;
		if (path === "/health") {
			return new Response(discord.isReady() ? "ok" : "starting", {
				status: discord.isReady() ? 200 : 503,
			});
		}
		if (path === "/linear-webhook" && req.method === "POST") {
			return handleLinearWebhook(req);
		}
		return new Response("not found", { status: 404 });
	},
});

await resolveLinearIds();
await discord.login(env.DISCORD_BOT_TOKEN);
