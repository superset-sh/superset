import { stringList } from "./api";

export interface Attachment {
	filename: string;
	content: string;
	mimeType?: string;
}

export interface EmailFields {
	to: string[];
	cc: string[];
	bcc: string[];
	subject: string;
	body: string;
	htmlBody?: string;
	attachments: Attachment[];
	inReplyTo?: string;
	references?: string;
	threadId?: string;
}

const ASCII = /^[\x20-\x7e]*$/;

function base64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function base64Utf8(value: string): string {
	return base64(new TextEncoder().encode(value));
}

function base64Url(value: string): string {
	return base64Utf8(value)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function encodeHeader(value: string): string {
	return ASCII.test(value) ? value : `=?UTF-8?B?${base64Utf8(value)}?=`;
}

function encodeAddress(value: string): string {
	const match = value.match(/^\s*(.+?)\s*<([^>]+)>\s*$/);
	if (!match) return value.trim();
	return `${encodeHeader(match[1] as string)} <${(match[2] as string).trim()}>`;
}

function wrap(value: string): string {
	return (value.match(/.{1,76}/g) ?? []).join("\r\n");
}

function boundary(): string {
	return `=_superset_${globalThis.crypto.randomUUID().replace(/-/g, "")}`;
}

function part(contentType: string, content: string, extra: string[] = []) {
	return [
		`Content-Type: ${contentType}`,
		"Content-Transfer-Encoding: base64",
		...extra,
		"",
		wrap(base64Utf8(content)),
	].join("\r\n");
}

function attachmentPart(attachment: Attachment): string {
	const name = encodeHeader(attachment.filename);
	return [
		`Content-Type: ${attachment.mimeType ?? "application/octet-stream"}; name="${name}"`,
		"Content-Transfer-Encoding: base64",
		`Content-Disposition: attachment; filename="${name}"`,
		"",
		wrap(attachment.content.replace(/\s+/g, "")),
	].join("\r\n");
}

function multipart(subtype: string, parts: string[]): string {
	const mark = boundary();
	const body = parts
		.map((entry) => `--${mark}\r\n${entry}`)
		.concat(`--${mark}--`)
		.join("\r\n");
	return `${subtype}; boundary="${mark}"\r\n\r\n${body}`;
}

export function readEmailFields(args: Record<string, unknown>): EmailFields {
	const attachments = Array.isArray(args.attachments)
		? (args.attachments as Record<string, unknown>[]).map((entry) => {
				const filename = String(entry.filename ?? "").trim();
				const content = String(entry.content ?? "").trim();
				if (!filename || !content) {
					throw new Error("each attachment needs a filename and content");
				}
				return {
					filename,
					content,
					...(entry.mimeType ? { mimeType: String(entry.mimeType) } : {}),
				};
			})
		: [];

	return {
		to: stringList(args.to, "to"),
		cc: stringList(args.cc, "cc"),
		bcc: stringList(args.bcc, "bcc"),
		subject: String(args.subject ?? ""),
		body: String(args.body ?? ""),
		...(args.htmlBody ? { htmlBody: String(args.htmlBody) } : {}),
		attachments,
		...(args.inReplyTo ? { inReplyTo: String(args.inReplyTo) } : {}),
		...(args.references ? { references: String(args.references) } : {}),
		...(args.threadId ? { threadId: String(args.threadId) } : {}),
	};
}

export function buildMime(fields: EmailFields): string {
	if (!fields.to.length && !fields.cc.length && !fields.bcc.length) {
		throw new Error("at least one recipient is required in to, cc, or bcc");
	}

	const headers = ["MIME-Version: 1.0"];
	if (fields.to.length)
		headers.push(`To: ${fields.to.map(encodeAddress).join(", ")}`);
	if (fields.cc.length)
		headers.push(`Cc: ${fields.cc.map(encodeAddress).join(", ")}`);
	if (fields.bcc.length)
		headers.push(`Bcc: ${fields.bcc.map(encodeAddress).join(", ")}`);
	headers.push(`Subject: ${encodeHeader(fields.subject)}`);
	if (fields.inReplyTo) {
		headers.push(`In-Reply-To: ${fields.inReplyTo}`);
		headers.push(`References: ${fields.references ?? fields.inReplyTo}`);
	}

	const plain = part('text/plain; charset="UTF-8"', fields.body);
	const alternative = fields.htmlBody
		? multipart("multipart/alternative", [
				plain,
				part('text/html; charset="UTF-8"', fields.htmlBody),
			])
		: null;

	if (fields.attachments.length) {
		const lead = alternative ? `Content-Type: ${alternative}` : plain;
		return `${headers.join("\r\n")}\r\nContent-Type: ${multipart(
			"multipart/mixed",
			[lead, ...fields.attachments.map(attachmentPart)],
		)}`;
	}

	if (alternative) {
		return `${headers.join("\r\n")}\r\nContent-Type: ${alternative}`;
	}

	return `${headers.join("\r\n")}\r\n${plain}`;
}

export function encodeRaw(fields: EmailFields): string {
	return base64Url(buildMime(fields));
}

export function decodeBody(data?: string): string {
	if (!data) return "";
	const padded = data.replace(/-/g, "+").replace(/_/g, "/");
	const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) {
		bytes[index] = binary.charCodeAt(index);
	}
	return new TextDecoder().decode(bytes);
}

export function normalizeText(value: string): string {
	return value
		.replace(/\r\n/g, "\n")
		.replace(/[ \t]+$/gm, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export function htmlToText(html: string): string {
	return normalizeText(
		html
			.replace(/<style[\s\S]*?<\/style>/gi, "")
			.replace(/<script[\s\S]*?<\/script>/gi, "")
			.replace(/<br\s*\/?>/gi, "\n")
			.replace(/<li[^>]*>/gi, "\n- ")
			.replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
			.replace(/<[^>]+>/g, "")
			.replace(/&nbsp;/g, " ")
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'"),
	);
}

export interface MessagePart {
	mimeType?: string;
	filename?: string;
	body?: { data?: string; size?: number; attachmentId?: string };
	parts?: MessagePart[];
	headers?: { name?: string; value?: string }[];
}

export interface GmailMessage {
	id?: string;
	threadId?: string;
	snippet?: string;
	labelIds?: string[];
	internalDate?: string;
	payload?: MessagePart;
}

export interface AttachmentRef {
	filename: string;
	mimeType: string;
	size: number;
	attachmentId: string;
}

export interface ParsedMessage {
	id: string;
	threadId: string;
	from: string;
	to: string;
	cc: string;
	subject: string;
	date: string;
	messageId: string;
	labelIds: string[];
	body: string;
	attachments: AttachmentRef[];
}

function header(part: MessagePart | undefined, name: string): string {
	const match = part?.headers?.find(
		(entry) => entry.name?.toLowerCase() === name.toLowerCase(),
	);
	return match?.value ?? "";
}

function walk(
	part: MessagePart | undefined,
	found: { plain: string[]; html: string[]; attachments: AttachmentRef[] },
): void {
	if (!part) return;

	if (part.body?.attachmentId && part.filename) {
		found.attachments.push({
			filename: part.filename,
			mimeType: part.mimeType ?? "application/octet-stream",
			size: part.body.size ?? 0,
			attachmentId: part.body.attachmentId,
		});
	} else if (part.mimeType === "text/plain" && part.body?.data) {
		found.plain.push(decodeBody(part.body.data));
	} else if (part.mimeType === "text/html" && part.body?.data) {
		found.html.push(decodeBody(part.body.data));
	}

	for (const child of part.parts ?? []) walk(child, found);
}

export function parseMessage(message: GmailMessage): ParsedMessage {
	const found = {
		plain: [] as string[],
		html: [] as string[],
		attachments: [] as AttachmentRef[],
	};
	walk(message.payload, found);

	const body = found.plain.length
		? normalizeText(found.plain.join("\n"))
		: found.html.length
			? htmlToText(found.html.join("\n"))
			: (message.snippet ?? "");

	return {
		id: message.id ?? "",
		threadId: message.threadId ?? "",
		from: header(message.payload, "from"),
		to: header(message.payload, "to"),
		cc: header(message.payload, "cc"),
		subject: header(message.payload, "subject"),
		date: header(message.payload, "date"),
		messageId: header(message.payload, "message-id"),
		labelIds: message.labelIds ?? [],
		body,
		attachments: found.attachments,
	};
}

export function renderMessage(parsed: ParsedMessage): string {
	const lines = [
		`Subject: ${parsed.subject}`,
		`From: ${parsed.from}`,
		`To: ${parsed.to}`,
	];
	if (parsed.cc) lines.push(`Cc: ${parsed.cc}`);
	lines.push(`Date: ${parsed.date}`);
	lines.push(`Message ID: ${parsed.id}   Thread ID: ${parsed.threadId}`);
	if (parsed.labelIds.length)
		lines.push(`Labels: ${parsed.labelIds.join(", ")}`);
	if (parsed.attachments.length) {
		lines.push(
			`Attachments: ${parsed.attachments
				.map(
					(entry) =>
						`${entry.filename} (${entry.mimeType}, ${entry.size} bytes, id ${entry.attachmentId})`,
				)
				.join("; ")}`,
		);
	}
	lines.push("", parsed.body);
	return lines.join("\n");
}
