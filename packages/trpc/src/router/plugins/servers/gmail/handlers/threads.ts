import { gmail, requireString, stringList, text } from "../api";
import { type GmailMessage, parseMessage, renderMessage } from "../mime";
import type { Handler } from "../types";

interface Thread {
	id?: string;
	messages?: GmailMessage[];
}

async function modify(
	accessToken: string,
	threadId: string,
	body: { addLabelIds: string[]; removeLabelIds: string[] },
): Promise<void> {
	await gmail(accessToken, `/threads/${threadId}/modify`, {
		method: "POST",
		body,
	});
}

export const threadHandlers: Record<string, Handler> = {
	read_email_thread: async (args, accessToken) => {
		const threadId = requireString(args, "threadId");
		const thread = await gmail<Thread>(accessToken, `/threads/${threadId}`, {
			query: { format: "full" },
		});
		const messages = thread.messages ?? [];
		if (!messages.length) return text(`Thread ${threadId} has no messages`);

		const parsed = messages.map(parseMessage);
		const lines = [
			`Thread ${threadId} — ${messages.length} message(s)`,
			`Subject: ${parsed[0]?.subject || "(no subject)"}`,
		];
		parsed.forEach((message, index) => {
			lines.push("", `── Message ${index + 1} of ${parsed.length} ──`);
			lines.push(renderMessage(message));
		});
		return text(lines.join("\n"));
	},

	modify_thread: async (args, accessToken) => {
		const threadId = requireString(args, "threadId");
		const addLabelIds = stringList(args.addLabelIds, "addLabelIds");
		const removeLabelIds = stringList(args.removeLabelIds, "removeLabelIds");
		if (!addLabelIds.length && !removeLabelIds.length) {
			throw new Error("pass addLabelIds, removeLabelIds, or both");
		}
		await modify(accessToken, threadId, { addLabelIds, removeLabelIds });
		const parts: string[] = [];
		if (addLabelIds.length) parts.push(`added ${addLabelIds.join(", ")}`);
		if (removeLabelIds.length)
			parts.push(`removed ${removeLabelIds.join(", ")}`);
		return text(`✓ Thread ${threadId}: ${parts.join("; ")}`);
	},

	trash_thread: async (args, accessToken) => {
		const threadId = requireString(args, "threadId");
		await gmail(accessToken, `/threads/${threadId}/trash`, { method: "POST" });
		return text(`✓ Moved thread ${threadId} to Trash`);
	},

	untrash_thread: async (args, accessToken) => {
		const threadId = requireString(args, "threadId");
		await gmail(accessToken, `/threads/${threadId}/untrash`, {
			method: "POST",
		});
		return text(`✓ Restored thread ${threadId} from Trash`);
	},

	delete_thread: async (args, accessToken) => {
		const threadId = requireString(args, "threadId");
		await gmail(accessToken, `/threads/${threadId}`, { method: "DELETE" });
		return text(`✓ Permanently deleted thread ${threadId}`);
	},

	mark_thread_spam: async (args, accessToken) => {
		const threadId = requireString(args, "threadId");
		await modify(accessToken, threadId, {
			addLabelIds: ["SPAM"],
			removeLabelIds: ["INBOX"],
		});
		return text(`✓ Marked thread ${threadId} as spam`);
	},

	unmark_thread_spam: async (args, accessToken) => {
		const threadId = requireString(args, "threadId");
		await modify(accessToken, threadId, {
			addLabelIds: ["INBOX"],
			removeLabelIds: ["SPAM"],
		});
		return text(`✓ Removed thread ${threadId} from spam`);
	},
};
