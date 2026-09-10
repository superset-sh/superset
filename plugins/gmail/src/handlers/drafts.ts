import { gmail, mapLimited, optionalNumber, requireString, text } from "../api";
import {
	encodeRaw,
	type GmailMessage,
	parseMessage,
	readEmailFields,
	renderMessage,
} from "../mime";
import type { Handler } from "../types";

interface Draft {
	id?: string;
	message?: GmailMessage;
}

function draftBody(args: Record<string, unknown>) {
	const fields = readEmailFields(args);
	return {
		message: {
			raw: encodeRaw(fields),
			...(fields.threadId ? { threadId: fields.threadId } : {}),
		},
	};
}

export const draftHandlers: Record<string, Handler> = {
	draft_email: async (args, accessToken) => {
		const draft = await gmail<Draft>(accessToken, "/drafts", {
			method: "POST",
			body: draftBody(args),
		});
		return text(
			`✓ Created draft ${draft.id}\nMessage ID: ${draft.message?.id}\nThread ID: ${draft.message?.threadId}`,
		);
	},

	list_drafts: async (args, accessToken) => {
		const data = await gmail<{
			drafts?: Draft[];
			nextPageToken?: string;
			resultSizeEstimate?: number;
		}>(accessToken, "/drafts", {
			query: {
				maxResults: Math.min(optionalNumber(args, "maxResults") ?? 20, 100),
				q: args.query,
			},
		});

		const drafts = data.drafts ?? [];
		if (!drafts.length) return text("No drafts found");

		const details = await mapLimited(drafts, (draft) =>
			gmail<Draft>(accessToken, `/drafts/${draft.id}`, {
				query: { format: "metadata" },
			}).catch(() => null),
		);

		const lines = [`Found ${drafts.length} draft(s):`, ""];
		details.forEach((draft, index) => {
			const id = drafts[index]?.id ?? "";
			if (!draft?.message) {
				lines.push(`[${id}] (could not be read)`);
				return;
			}
			const parsed = parseMessage(draft.message);
			lines.push(
				`[${id}] To: ${parsed.to || "(no recipient)"}\n  ${parsed.subject || "(no subject)"}`,
			);
		});
		if (data.nextPageToken) {
			lines.push("", `📄 More available. pageToken: "${data.nextPageToken}"`);
		}
		return text(lines.join("\n"));
	},

	get_draft: async (args, accessToken) => {
		const draftId = requireString(args, "draftId");
		const draft = await gmail<Draft>(accessToken, `/drafts/${draftId}`, {
			query: { format: "full" },
		});
		if (!draft.message) throw new Error(`draft ${draftId} has no message`);
		return text(
			`Draft ID: ${draftId}\n${renderMessage(parseMessage(draft.message))}`,
		);
	},

	update_draft: async (args, accessToken) => {
		const draftId = requireString(args, "draftId");
		const draft = await gmail<Draft>(accessToken, `/drafts/${draftId}`, {
			method: "PUT",
			body: draftBody(args),
		});
		return text(`✓ Updated draft ${draft.id ?? draftId}`);
	},

	delete_draft: async (args, accessToken) => {
		const draftId = requireString(args, "draftId");
		await gmail(accessToken, `/drafts/${draftId}`, { method: "DELETE" });
		return text(`✓ Deleted draft ${draftId}`);
	},

	send_draft: async (args, accessToken) => {
		const draftId = requireString(args, "draftId");
		const sent = await gmail<{ id?: string; threadId?: string }>(
			accessToken,
			"/drafts/send",
			{ method: "POST", body: { id: draftId } },
		);
		return text(
			`✓ Sent draft ${draftId}\nMessage ID: ${sent.id}\nThread ID: ${sent.threadId}`,
		);
	},
};
