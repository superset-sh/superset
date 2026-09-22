import {
	gmail,
	mapLimited,
	optionalNumber,
	requireString,
	stringList,
	text,
} from "../api";
import {
	encodeRaw,
	type GmailMessage,
	parseMessage,
	readEmailFields,
	renderMessage,
} from "../mime";
import type { Handler } from "../types";

function labelChange(args: Record<string, unknown>) {
	const addLabelIds = stringList(args.addLabelIds, "addLabelIds");
	const removeLabelIds = stringList(args.removeLabelIds, "removeLabelIds");
	if (!addLabelIds.length && !removeLabelIds.length) {
		throw new Error("pass addLabelIds, removeLabelIds, or both");
	}
	return { addLabelIds, removeLabelIds };
}

async function summarize(
	accessToken: string,
	ids: { id?: string; threadId?: string }[],
): Promise<string[]> {
	const messages = await mapLimited(ids, (entry) =>
		gmail<GmailMessage>(accessToken, `/messages/${entry.id}`, {
			query: {
				format: "metadata",
				metadataHeaders: ["From", "Subject", "Date"],
			},
		}).catch(() => null),
	);

	return messages.map((message, index) => {
		const fallback = ids[index]?.id ?? "";
		if (!message) return `${fallback} (could not be read)`;
		const parsed = parseMessage(message);
		const unread = parsed.labelIds.includes("UNREAD") ? " •" : "";
		return `[${parsed.id}] ${parsed.date} — ${parsed.from}${unread}\n  ${parsed.subject || "(no subject)"}  (thread ${parsed.threadId})`;
	});
}

export const messageHandlers: Record<string, Handler> = {
	send_email: async (args, accessToken) => {
		const fields = readEmailFields(args);
		const sent = await gmail<{ id?: string; threadId?: string }>(
			accessToken,
			"/messages/send",
			{
				method: "POST",
				body: {
					raw: encodeRaw(fields),
					...(fields.threadId ? { threadId: fields.threadId } : {}),
				},
			},
		);
		return text(
			`✓ Sent to ${[...fields.to, ...fields.cc, ...fields.bcc].join(", ")}\nMessage ID: ${sent.id}\nThread ID: ${sent.threadId}`,
		);
	},

	read_email: async (args, accessToken) => {
		const message = await gmail<GmailMessage>(
			accessToken,
			`/messages/${requireString(args, "messageId")}`,
			{ query: { format: "full" } },
		);
		return text(renderMessage(parseMessage(message)));
	},

	search_emails: async (args, accessToken) => {
		const maxResults = Math.min(optionalNumber(args, "maxResults") ?? 20, 100);
		const data = await gmail<{
			messages?: { id?: string; threadId?: string }[];
			nextPageToken?: string;
			resultSizeEstimate?: number;
		}>(accessToken, "/messages", {
			query: {
				q: args.query,
				maxResults,
				pageToken: args.pageToken,
			},
		});

		const found = data.messages ?? [];
		if (!found.length) return text("No messages matched that query");

		const lines = [
			`Found ${found.length} message(s)${data.resultSizeEstimate ? ` of about ${data.resultSizeEstimate}` : ""}:`,
			"",
			...(await summarize(accessToken, found)),
		];
		if (data.nextPageToken) {
			lines.push("", `📄 More available. pageToken: "${data.nextPageToken}"`);
		}
		return text(lines.join("\n"));
	},

	modify_email: async (args, accessToken) => {
		const messageId = requireString(args, "messageId");
		const change = labelChange(args);
		await gmail(accessToken, `/messages/${messageId}/modify`, {
			method: "POST",
			body: change,
		});
		const parts: string[] = [];
		if (change.addLabelIds.length)
			parts.push(`added ${change.addLabelIds.join(", ")}`);
		if (change.removeLabelIds.length)
			parts.push(`removed ${change.removeLabelIds.join(", ")}`);
		return text(`✓ Message ${messageId}: ${parts.join("; ")}`);
	},

	delete_email: async (args, accessToken) => {
		const messageId = requireString(args, "messageId");
		await gmail(accessToken, `/messages/${messageId}`, { method: "DELETE" });
		return text(`✓ Permanently deleted message ${messageId}`);
	},

	batch_modify_emails: async (args, accessToken) => {
		const ids = stringList(args.messageIds, "messageIds");
		if (!ids.length) throw new Error("messageIds is required");
		const change = labelChange(args);
		await gmail(accessToken, "/messages/batchModify", {
			method: "POST",
			body: { ids, ...change },
		});
		return text(`✓ Modified labels on ${ids.length} message(s)`);
	},

	batch_delete_emails: async (args, accessToken) => {
		const ids = stringList(args.messageIds, "messageIds");
		if (!ids.length) throw new Error("messageIds is required");
		await gmail(accessToken, "/messages/batchDelete", {
			method: "POST",
			body: { ids },
		});
		return text(`✓ Permanently deleted ${ids.length} message(s)`);
	},

	get_attachment: async (args, accessToken) => {
		const messageId = requireString(args, "messageId");
		const attachmentId = requireString(args, "attachmentId");
		const data = await gmail<{ data?: string; size?: number }>(
			accessToken,
			`/messages/${messageId}/attachments/${attachmentId}`,
		);
		if (!data.data) throw new Error("attachment returned no data");
		return text(
			`Attachment from ${messageId} (${data.size ?? 0} bytes), base64:\n\n${data.data}`,
		);
	},

	list_history: async (args, accessToken) => {
		const data = await gmail<{
			history?: Record<string, unknown>[];
			historyId?: string;
			nextPageToken?: string;
		}>(accessToken, "/history", {
			query: {
				startHistoryId: requireString(args, "startHistoryId"),
				maxResults: optionalNumber(args, "maxResults"),
			},
		});
		const history = data.history ?? [];
		if (!history.length) {
			return text(`No changes since that history ID (now ${data.historyId})`);
		}
		return text(
			`${history.length} change record(s), current history ID ${data.historyId}:\n\n${JSON.stringify(history, null, 2)}`,
		);
	},

	mark_message_spam: async (args, accessToken) => {
		const messageId = requireString(args, "messageId");
		await gmail(accessToken, `/messages/${messageId}/modify`, {
			method: "POST",
			body: { addLabelIds: ["SPAM"], removeLabelIds: ["INBOX"] },
		});
		return text(`✓ Marked message ${messageId} as spam`);
	},

	unmark_message_spam: async (args, accessToken) => {
		const messageId = requireString(args, "messageId");
		await gmail(accessToken, `/messages/${messageId}/modify`, {
			method: "POST",
			body: { addLabelIds: ["INBOX"], removeLabelIds: ["SPAM"] },
		});
		return text(`✓ Removed message ${messageId} from spam`);
	},
};
