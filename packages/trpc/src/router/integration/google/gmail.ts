import { gmail, type gmail_v1 } from "@googleapis/gmail";
import { googleAuthFor, googleErrorStatus } from "./auth";
import { GMAIL_WATCH_TTL_MS, GOOGLE_API_TIMEOUT_MS } from "./constants";

/** The SDK's resources, narrowed to what Gmail always sends. */
export type GmailLabel = gmail_v1.Schema$Label & { id: string; name: string };
export type GmailMessage = gmail_v1.Schema$Message & {
	id: string;
	threadId: string;
};

async function gmailFor(connectionId: string): Promise<gmail_v1.Gmail> {
	return gmail({
		version: "v1",
		auth: await googleAuthFor(connectionId),
		timeout: GOOGLE_API_TIMEOUT_MS,
	});
}

export async function listLabels(connectionId: string): Promise<GmailLabel[]> {
	const client = await gmailFor(connectionId);
	const { data } = await client.users.labels.list({ userId: "me" });
	return (data.labels ?? []).filter(
		(label): label is GmailLabel => !!label.id && !!label.name,
	);
}

export async function getProfile(
	connectionId: string,
): Promise<{ emailAddress: string; historyId: string }> {
	const client = await gmailFor(connectionId);
	const { data } = await client.users.getProfile({ userId: "me" });
	if (!data.emailAddress || !data.historyId) {
		throw new Error("Gmail profile returned no email or history id");
	}
	return { emailAddress: data.emailAddress, historyId: data.historyId };
}

/**
 * Message ids added since `startHistoryId`, and the mailbox's current history
 * id to continue from. `expired` when Google no longer holds history that far
 * back (a week or so): the caller resets from the profile and accepts the gap.
 */
export async function listAddedMessages(
	connectionId: string,
	startHistoryId: string,
): Promise<
	| { expired: true }
	| {
			expired: false;
			historyId: string;
			messages: Array<{ id: string; threadId: string; labelIds: string[] }>;
	  }
> {
	const client = await gmailFor(connectionId);
	const byId = new Map<
		string,
		{ id: string; threadId: string; labelIds: string[] }
	>();
	let pageToken: string | undefined;
	let historyId: string | undefined;
	do {
		let page: gmail_v1.Schema$ListHistoryResponse;
		try {
			({ data: page } = await client.users.history.list({
				userId: "me",
				startHistoryId,
				historyTypes: ["messageAdded"],
				maxResults: 500,
				pageToken,
			}));
		} catch (error) {
			if (googleErrorStatus(error) === 404) {
				return { expired: true };
			}
			throw error;
		}
		for (const record of page.history ?? []) {
			for (const added of record.messagesAdded ?? []) {
				const message = added.message;
				if (!message?.id || !message.threadId) continue;
				// The same message can appear in several records as labels
				// change; the last record's labels are the current ones.
				byId.set(message.id, {
					id: message.id,
					threadId: message.threadId,
					labelIds: message.labelIds ?? [],
				});
			}
		}
		historyId = page.historyId ?? historyId;
		pageToken = page.nextPageToken ?? undefined;
	} while (pageToken);
	if (!historyId) {
		throw new Error("Gmail history.list returned no history id");
	}
	return { expired: false, historyId, messages: [...byId.values()] };
}

/**
 * `format=full` is the only format that carries the MIME tree, which is where
 * attachments show; the field mask then leaves the body data itself out, so
 * what crosses the wire is headers, labels and part metadata. Four levels of
 * parts covers ordinary multipart mail; anything deeper simply reports no
 * attachment.
 */
const MESSAGE_FIELDS = (() => {
	let parts = "mimeType,filename,body(attachmentId,size)";
	for (let depth = 0; depth < 4; depth += 1) {
		parts = `mimeType,filename,body(attachmentId,size),parts(${parts})`;
	}
	return `id,threadId,labelIds,historyId,internalDate,sizeEstimate,payload(headers,${parts})`;
})();

/** Null when the message was deleted between the history record and now. */
export async function getMessage(
	connectionId: string,
	messageId: string,
): Promise<GmailMessage | null> {
	const client = await gmailFor(connectionId);
	try {
		const { data } = await client.users.messages.get({
			userId: "me",
			id: messageId,
			format: "full",
			fields: MESSAGE_FIELDS,
		});
		return data.id && data.threadId ? (data as GmailMessage) : null;
	} catch (error) {
		if (googleErrorStatus(error) === 404) return null;
		throw error;
	}
}

/**
 * Asks Gmail to publish `{emailAddress, historyId}` to the topic on every
 * mailbox change. Lasts a week at most and never renews itself.
 */
export async function watchMailbox(
	connectionId: string,
	topicName: string,
): Promise<{ historyId: string; expiration: number }> {
	const client = await gmailFor(connectionId);
	const { data } = await client.users.watch({
		userId: "me",
		requestBody: { topicName },
	});
	if (!data.historyId) {
		throw new Error("Gmail watch returned no history id");
	}
	return {
		historyId: data.historyId,
		expiration: Number(data.expiration ?? Date.now() + GMAIL_WATCH_TTL_MS),
	};
}

export async function stopMailboxWatch(connectionId: string): Promise<void> {
	const client = await gmailFor(connectionId);
	await client.users.stop({ userId: "me" });
}

export function headerValue(
	message: GmailMessage,
	name: string,
): string | null {
	const wanted = name.toLowerCase();
	const header = message.payload?.headers?.find(
		(h) => h.name?.toLowerCase() === wanted,
	);
	return header?.value ?? null;
}

/**
 * The bare addresses in a header like `"Ada" <ada@acme.com>, bob@acme.com`,
 * lower-cased. Display names are dropped; matching is on the address.
 */
export function parseAddresses(header: string | null): string[] {
	if (!header) return [];
	const found = header.match(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
	return [...new Set(found.map((address) => address.toLowerCase()))];
}

/** A part with a filename or an attachment id is an attachment. */
export function messageHasAttachment(message: GmailMessage): boolean {
	const walk = (part: gmail_v1.Schema$MessagePart | undefined): boolean => {
		if (!part) return false;
		if (part.filename || part.body?.attachmentId) return true;
		return (part.parts ?? []).some(walk);
	};
	return walk(message.payload);
}
