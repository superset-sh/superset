import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

const API = "https://api.resend.com";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${API}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${env.RESEND_API_KEY}`,
			"Content-Type": "application/json",
			...init?.headers,
		},
	});
	if (!res.ok) {
		throw new Error(
			`Resend ${init?.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`,
		);
	}
	return (await res.json()) as T;
}

export type OutboundAttachment = { filename: string; path: string };

export async function sendEmail(opts: {
	from: string;
	to: string;
	subject: string;
	text: string;
	inReplyTo?: string;
	references?: string[];
	attachments?: OutboundAttachment[];
}): Promise<{ id: string }> {
	const headers: Record<string, string> = {};
	if (opts.inReplyTo) headers["In-Reply-To"] = opts.inReplyTo;
	if (opts.references?.length) headers.References = opts.references.join(" ");
	return api<{ id: string }>("/emails", {
		method: "POST",
		body: JSON.stringify({
			from: opts.from,
			to: [opts.to],
			subject: opts.subject,
			text: opts.text,
			headers,
			attachments: opts.attachments,
		}),
	});
}

// The RFC Message-ID is assigned on delivery, so it can lag the send call.
export async function waitForMessageId(emailId: string): Promise<string> {
	for (let i = 0; i < 10; i++) {
		const email = await api<{ message_id?: string | null }>(
			`/emails/${emailId}`,
		);
		if (email.message_id) return email.message_id;
		await new Promise((r) => setTimeout(r, 1500));
	}
	throw new Error(`no Message-ID for Resend email ${emailId}`);
}

export type ReceivedEmail = {
	id: string;
	from: string;
	to: string[];
	subject: string | null;
	text: string | null;
	html: string | null;
	message_id: string | null;
	headers: Record<string, string>;
	attachments: { id: string; filename: string; content_type: string }[];
};

export function getReceivedEmail(id: string): Promise<ReceivedEmail> {
	return api<ReceivedEmail>(`/emails/receiving/${id}`);
}

export function getReceivedAttachment(
	emailId: string,
	attachmentId: string,
): Promise<{ download_url: string; filename: string; size: number }> {
	return api(`/emails/receiving/${emailId}/attachments/${attachmentId}`);
}

// Resend webhooks are Svix-signed: HMAC-SHA256 over `${id}.${timestamp}.${body}`
// with the base64 secret after the `whsec_` prefix; the header may carry
// several space-separated `v1,<base64>` signatures.
export function verifyWebhook(
	headers: Headers,
	rawBody: string,
	secret: string,
): boolean {
	const id = headers.get("svix-id");
	const timestamp = headers.get("svix-timestamp");
	const signatures = headers.get("svix-signature");
	if (!id || !timestamp || !signatures) return false;
	if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
	const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
	const expected = createHmac("sha256", key)
		.update(`${id}.${timestamp}.${rawBody}`)
		.digest();
	return signatures.split(" ").some((entry) => {
		const [version, sig] = entry.split(",");
		if (version !== "v1" || !sig) return false;
		const given = Buffer.from(sig, "base64");
		return given.length === expected.length && timingSafeEqual(given, expected);
	});
}
