import {
	type Attachment,
	AttachmentBuilder,
	type Client,
	type Message,
	type ThreadChannel,
	type User,
} from "discord.js";
import { brandedEmbed, SUPPORT_NAME } from "./branding";
import { env } from "./env";
import {
	getReceivedAttachment,
	getReceivedEmail,
	type OutboundAttachment,
	type ReceivedEmail,
	sendEmail,
	verifyWebhook,
	waitForMessageId,
} from "./resend";
import { store } from "./store";

// Resend rejects larger uploads; bigger files stay as (expiring) Discord links.
const MAX_EMAIL_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_DISCORD_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_EMBED_CHARS = 4000;

const domain = env.BRIDGE_EMAIL_DOMAIN ?? "";
const inbound = env.PLAIN_INBOUND_ADDRESS ?? "";

function customerAddress(user: User): string {
	const name = (user.globalName ?? user.username).replace(/[<>"\r\n]/g, "");
	return `${name} <discord-${user.id}@${domain}>`;
}

function splitAttachments(attachments: Attachment[]): {
	attached: OutboundAttachment[];
	linked: Attachment[];
} {
	const attached: OutboundAttachment[] = [];
	const linked: Attachment[] = [];
	let budget = 40 * 1024 * 1024;
	for (const a of attachments) {
		if (a.size <= MAX_EMAIL_ATTACHMENT_BYTES && a.size <= budget) {
			attached.push({ filename: a.name, path: a.url });
			budget -= a.size;
		} else {
			linked.push(a);
		}
	}
	return { attached, linked };
}

function emailBody(opts: {
	content: string;
	author: User;
	url: string;
	linked: Attachment[];
	intro?: string;
}): string {
	const parts = [opts.intro, opts.content || "(no text, see attachments)"];
	if (opts.linked.length > 0) {
		parts.push(
			`Large attachments (Discord links expire):\n${opts.linked.map((a) => `- ${a.name}: ${a.url}`).join("\n")}`,
		);
	}
	parts.push(`--\nDiscord: ${opts.url}\nFrom: @${opts.author.username}`);
	return parts.filter(Boolean).join("\n\n");
}

/** Opens the email conversation for a new Discord report. */
export async function openBridgeThread(opts: {
	thread: ThreadChannel;
	author: User;
	title: string;
	content: string;
	url: string;
	attachments: Attachment[];
}): Promise<void> {
	const { attached, linked } = splitAttachments(opts.attachments);
	const sent = await sendEmail({
		from: customerAddress(opts.author),
		to: inbound,
		subject: opts.title,
		text: emailBody({
			content: opts.content,
			author: opts.author,
			url: opts.url,
			linked,
			intro: `New report from the Superset Discord #${opts.thread.parent?.name ?? "support"} channel.`,
		}),
		attachments: attached,
	});
	const rootMessageId = await waitForMessageId(sent.id);
	store.createThread({
		discordThreadId: opts.thread.id,
		discordUserId: opts.author.id,
		subject: opts.title,
		rootMessageId,
		lastMessageId: rootMessageId,
	});
	console.log(`bridged thread ${opts.thread.id} -> email ${sent.id}`);
}

/** Forwards a follow-up Discord message into its email conversation. */
export async function relayFollowUp(message: Message): Promise<void> {
	if (!message.channel.isThread()) return;
	const thread = store.getThread(message.channel.id);
	if (!thread) return;
	const { attached, linked } = splitAttachments([
		...message.attachments.values(),
	]);
	const sent = await sendEmail({
		from: customerAddress(message.author),
		to: inbound,
		subject: `Re: ${thread.subject}`,
		text: emailBody({
			content: message.content,
			author: message.author,
			url: message.url,
			linked,
		}),
		inReplyTo: thread.lastMessageId,
		references: [thread.rootMessageId, thread.lastMessageId].filter(
			(id, i, all) => all.indexOf(id) === i,
		),
		attachments: attached,
	});
	const messageId = await waitForMessageId(sent.id);
	store.rememberMessageId(messageId, thread.discordThreadId);
}

function referencedIds(email: ReceivedEmail): string[] {
	const raw = `${email.headers["in-reply-to"] ?? ""} ${email.headers.references ?? ""}`;
	return raw.match(/<[^>]+>/g) ?? [];
}

// Keep the fresh reply; drop the quoted history mail clients append.
export function replyText(text: string): string {
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	const cut = lines.findIndex(
		(line, i) =>
			/^On .+ wrote:\s*$/.test(line.trim()) ||
			(line.startsWith(">") &&
				lines.slice(i).every((l) => l.startsWith(">") || l.trim() === "")),
	);
	const kept = cut === -1 ? lines : lines.slice(0, cut);
	return kept.join("\n").trim();
}

function isAutomatic(email: ReceivedEmail): boolean {
	const auto = email.headers["auto-submitted"];
	return (
		(!!auto && auto !== "no") ||
		/^(automatic reply|out of office)/i.test(email.subject ?? "")
	);
}

async function discordFiles(
	email: ReceivedEmail,
): Promise<AttachmentBuilder[]> {
	const files: AttachmentBuilder[] = [];
	for (const a of email.attachments) {
		try {
			const meta = await getReceivedAttachment(email.id, a.id);
			if (meta.size > MAX_DISCORD_UPLOAD_BYTES) continue;
			const res = await fetch(meta.download_url, {
				signal: AbortSignal.timeout(20_000),
			});
			if (!res.ok) continue;
			files.push(
				new AttachmentBuilder(Buffer.from(await res.arrayBuffer()), {
					name: meta.filename || a.filename,
				}),
			);
		} catch (err) {
			console.error(`attachment ${a.id} from email ${email.id} failed`, err);
		}
	}
	return files;
}

async function deliverReply(discord: Client, email: ReceivedEmail) {
	// Message-ID correlation only: anyone can email a synthetic address, so a
	// subject or recipient match must never be enough to speak in a thread.
	const thread = store.findThreadByMessageIds(referencedIds(email));
	if (!thread) {
		console.warn(`inbound email ${email.id} matches no bridged thread`);
		return;
	}
	if (email.message_id) {
		store.rememberMessageId(email.message_id, thread.discordThreadId);
	}
	const channel = await discord.channels.fetch(thread.discordThreadId);
	if (!channel?.isThread()) return;
	const body = replyText(email.text ?? "") || "(empty reply)";
	const embed = brandedEmbed()
		.setAuthor({ name: SUPPORT_NAME })
		.setDescription(
			body.length > MAX_EMBED_CHARS
				? `${body.slice(0, MAX_EMBED_CHARS - 1)}…`
				: body,
		);
	await channel.send({ embeds: [embed], files: await discordFiles(email) });
	if (channel.archived) await channel.setArchived(false).catch(() => {});
	console.log(`relayed email ${email.id} to thread ${thread.discordThreadId}`);
}

type ResendWebhook = { type?: string; data?: { email_id?: string } };

export async function handleResendWebhook(
	discord: Client,
	req: Request,
): Promise<Response> {
	if (!env.RESEND_WEBHOOK_SECRET) {
		return new Response("webhook not configured", { status: 503 });
	}
	const raw = await req.text();
	if (!verifyWebhook(req.headers, raw, env.RESEND_WEBHOOK_SECRET)) {
		console.warn("resend webhook rejected: bad signature");
		return new Response("bad signature", { status: 401 });
	}
	const payload = JSON.parse(raw) as ResendWebhook;
	const emailId = payload.data?.email_id;
	if (payload.type !== "email.received" || !emailId) {
		return new Response("ignored");
	}
	// At-least-once delivery: acknowledge duplicates without reposting. The
	// claim is released on failure so Resend's retry is not treated as a
	// duplicate of a delivery that never happened.
	if (!store.markInboundProcessed(emailId)) return new Response("duplicate");
	try {
		const email = await getReceivedEmail(emailId);
		if (!isAutomatic(email)) await deliverReply(discord, email);
	} catch (err) {
		store.unmarkInboundProcessed(emailId);
		console.error(`resend webhook handling failed for ${emailId}`, err);
		return new Response("handling failed", { status: 500 });
	}
	return new Response("ok");
}
