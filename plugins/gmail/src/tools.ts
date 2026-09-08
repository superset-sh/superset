import { PRESETS } from "./palette";
import type { ToolDefinition } from "./types";

function tool(
	name: string,
	description: string,
	properties: Record<string, unknown>,
	required: string[],
	readOnly: boolean,
	destructive = false,
): ToolDefinition {
	return {
		name,
		description,
		inputSchema: { type: "object", properties, required },
		annotations: { readOnlyHint: readOnly, destructiveHint: destructive },
	};
}

const MESSAGE_ID = {
	type: "string",
	description: "Gmail message ID, e.g. 18f2a1b3c4d5e6f7.",
};
const THREAD_ID = {
	type: "string",
	description: "Gmail thread ID. A thread groups a conversation's messages.",
};
const DRAFT_ID = { type: "string", description: "Gmail draft ID." };
const LABEL_ID = {
	type: "string",
	description:
		"Label ID. System labels use their name (INBOX, UNREAD, STARRED, SPAM, TRASH, IMPORTANT); user labels use an opaque id from list_email_labels.",
};
const ADD_LABELS = {
	type: "array",
	items: { type: "string" },
	description: "Label IDs to add.",
};
const REMOVE_LABELS = {
	type: "array",
	items: { type: "string" },
	description: "Label IDs to remove.",
};
const COLOR = {
	description: `Label color: a preset name (${Object.keys(PRESETS).join(", ")}) or an explicit {textColor, backgroundColor} pair. Gmail only accepts values from its fixed palette.`,
	oneOf: [
		{ type: "string" },
		{
			type: "object",
			properties: {
				textColor: { type: "string" },
				backgroundColor: { type: "string" },
			},
			required: ["textColor", "backgroundColor"],
		},
	],
};

const COMPOSE = {
	to: {
		type: "array",
		items: { type: "string" },
		description: 'Recipients, e.g. ["a@example.com", "Name <b@example.com>"].',
	},
	cc: {
		type: "array",
		items: { type: "string" },
		description: "Cc addresses.",
	},
	bcc: {
		type: "array",
		items: { type: "string" },
		description: "Bcc addresses.",
	},
	subject: { type: "string", description: "Subject line." },
	body: { type: "string", description: "Plain-text body." },
	htmlBody: {
		type: "string",
		description:
			"Optional HTML body. When set, the message is sent multipart/alternative with body as the plain-text fallback.",
	},
	attachments: {
		type: "array",
		description: "Files to attach.",
		items: {
			type: "object",
			properties: {
				filename: { type: "string" },
				content: { type: "string", description: "Base64-encoded file bytes." },
				mimeType: {
					type: "string",
					description: "Defaults to application/octet-stream.",
				},
			},
			required: ["filename", "content"],
		},
	},
	inReplyTo: {
		type: "string",
		description:
			"RFC Message-ID of the message being replied to, e.g. <abc@mail.gmail.com>. Read it from read_email's Message ID header.",
	},
	references: {
		type: "string",
		description: "References header; defaults to inReplyTo when omitted.",
	},
	threadId: {
		type: "string",
		description: "Thread to attach this message to, for replies.",
	},
};

export function getTools(): ToolDefinition[] {
	return [
		tool(
			"send_email",
			"Sends a new email immediately",
			COMPOSE,
			["body"],
			false,
			true,
		),
		tool(
			"draft_email",
			"Creates a draft email without sending it",
			COMPOSE,
			["body"],
			false,
		),
		tool(
			"read_email",
			"Retrieves the full content of a specific email, including headers, body, and attachment references",
			{ messageId: MESSAGE_ID },
			["messageId"],
			true,
		),
		tool(
			"read_email_thread",
			"Retrieves every message in a thread in readable order",
			{ threadId: THREAD_ID },
			["threadId"],
			true,
		),
		tool(
			"search_emails",
			"Searches emails using Gmail search syntax, e.g. 'from:me is:unread after:2026/01/01'",
			{
				query: {
					type: "string",
					description: "Gmail search query. Empty matches everything.",
				},
				maxResults: {
					type: "number",
					description: "Maximum messages to return (default 20, max 100).",
				},
				pageToken: {
					type: "string",
					description: "Page token from a previous search_emails call.",
				},
			},
			[],
			true,
		),
		tool(
			"modify_email",
			"Adds or removes labels on a single message, which is how mail is archived, starred, or marked read",
			{
				messageId: MESSAGE_ID,
				addLabelIds: ADD_LABELS,
				removeLabelIds: REMOVE_LABELS,
			},
			["messageId"],
			false,
		),
		tool(
			"delete_email",
			"Permanently deletes a message. This cannot be undone; prefer modify_email with addLabelIds ['TRASH']",
			{ messageId: MESSAGE_ID },
			["messageId"],
			false,
			true,
		),
		tool(
			"batch_modify_emails",
			"Adds or removes labels on up to 1000 messages in one call",
			{
				messageIds: {
					type: "array",
					items: { type: "string" },
					description: "Message IDs to modify.",
				},
				addLabelIds: ADD_LABELS,
				removeLabelIds: REMOVE_LABELS,
			},
			["messageIds"],
			false,
		),
		tool(
			"batch_delete_emails",
			"Permanently deletes up to 1000 messages. This cannot be undone",
			{
				messageIds: {
					type: "array",
					items: { type: "string" },
					description: "Message IDs to delete.",
				},
			},
			["messageIds"],
			false,
			true,
		),
		tool(
			"get_attachment",
			"Fetches an attachment's bytes as base64. Attachment IDs come from read_email",
			{ messageId: MESSAGE_ID, attachmentId: { type: "string" } },
			["messageId", "attachmentId"],
			true,
		),
		tool(
			"list_history",
			"Lists mailbox changes since a history ID, for detecting what changed",
			{
				startHistoryId: {
					type: "string",
					description: "History ID to start from.",
				},
				maxResults: { type: "number", description: "Maximum records." },
			},
			["startHistoryId"],
			true,
		),

		tool(
			"list_drafts",
			"Lists draft emails",
			{
				maxResults: {
					type: "number",
					description: "Maximum drafts (max 100).",
				},
				query: { type: "string", description: "Gmail search query." },
			},
			[],
			true,
		),
		tool(
			"get_draft",
			"Retrieves a draft's full content",
			{ draftId: DRAFT_ID },
			["draftId"],
			true,
		),
		tool(
			"update_draft",
			"Replaces a draft's content. Omitted fields are not preserved",
			{ draftId: DRAFT_ID, ...COMPOSE },
			["draftId", "body"],
			false,
		),
		tool(
			"delete_draft",
			"Permanently deletes a draft",
			{ draftId: DRAFT_ID },
			["draftId"],
			false,
			true,
		),
		tool(
			"send_draft",
			"Sends an existing draft",
			{ draftId: DRAFT_ID },
			["draftId"],
			false,
			true,
		),

		tool(
			"modify_thread",
			"Adds or removes labels on every message in a thread",
			{
				threadId: THREAD_ID,
				addLabelIds: ADD_LABELS,
				removeLabelIds: REMOVE_LABELS,
			},
			["threadId"],
			false,
		),
		tool(
			"trash_thread",
			"Moves a whole thread to Trash, which is reversible with untrash_thread",
			{ threadId: THREAD_ID },
			["threadId"],
			false,
		),
		tool(
			"untrash_thread",
			"Restores a thread from Trash",
			{ threadId: THREAD_ID },
			["threadId"],
			false,
		),
		tool(
			"delete_thread",
			"Permanently deletes a whole thread. This cannot be undone",
			{ threadId: THREAD_ID },
			["threadId"],
			false,
			true,
		),

		tool(
			"mark_message_spam",
			"Marks a message as spam and removes it from the inbox",
			{ messageId: MESSAGE_ID },
			["messageId"],
			false,
		),
		tool(
			"unmark_message_spam",
			"Removes a message from spam and returns it to the inbox",
			{ messageId: MESSAGE_ID },
			["messageId"],
			false,
		),
		tool(
			"mark_thread_spam",
			"Marks a whole thread as spam and removes it from the inbox",
			{ threadId: THREAD_ID },
			["threadId"],
			false,
		),
		tool(
			"unmark_thread_spam",
			"Removes a thread from spam and returns it to the inbox",
			{ threadId: THREAD_ID },
			["threadId"],
			false,
		),

		tool("list_email_labels", "Lists every label in the mailbox", {}, [], true),
		tool(
			"create_label",
			"Creates a label, optionally with a color from Gmail's fixed palette",
			{
				name: {
					type: "string",
					description: "Label name. Use 'Parent/Child' for nesting.",
				},
				color: COLOR,
				messageListVisibility: {
					type: "string",
					enum: ["show", "hide"],
					description: "Whether messages with this label show in the list.",
				},
				labelListVisibility: {
					type: "string",
					enum: ["labelShow", "labelShowIfUnread", "labelHide"],
					description: "Whether the label shows in the sidebar.",
				},
			},
			["name"],
			false,
		),
		tool(
			"update_label",
			"Renames or recolors an existing label. Omitted fields are preserved",
			{
				labelId: LABEL_ID,
				name: { type: "string" },
				color: COLOR,
				messageListVisibility: { type: "string", enum: ["show", "hide"] },
				labelListVisibility: {
					type: "string",
					enum: ["labelShow", "labelShowIfUnread", "labelHide"],
				},
			},
			["labelId"],
			false,
		),
		tool(
			"delete_label",
			"Deletes a label and removes it from every message carrying it",
			{ labelId: LABEL_ID },
			["labelId"],
			false,
			true,
		),
		tool(
			"get_or_create_label",
			"Returns a label by name, creating it if it does not exist",
			{ name: { type: "string" }, color: COLOR },
			["name"],
			false,
		),

		tool("list_filters", "Lists every Gmail filter", {}, [], true),
		tool(
			"get_filter",
			"Retrieves one filter's criteria and actions",
			{ filterId: { type: "string" } },
			["filterId"],
			true,
		),
		tool(
			"create_filter",
			"Creates a filter from raw criteria and actions",
			{
				criteria: {
					type: "object",
					description: "Match conditions.",
					properties: {
						from: { type: "string" },
						to: { type: "string" },
						subject: { type: "string" },
						query: { type: "string", description: "Gmail search syntax." },
						negatedQuery: { type: "string" },
						hasAttachment: { type: "boolean" },
						excludeChats: { type: "boolean" },
						size: { type: "number", description: "Size in bytes." },
						sizeComparison: { type: "string", enum: ["larger", "smaller"] },
					},
				},
				action: {
					type: "object",
					description: "What to do with matches.",
					properties: {
						addLabelIds: { type: "array", items: { type: "string" } },
						removeLabelIds: { type: "array", items: { type: "string" } },
						forward: { type: "string" },
					},
				},
			},
			["criteria", "action"],
			false,
		),
		tool(
			"create_filter_from_template",
			"Creates a filter from a named template instead of raw criteria",
			{
				template: {
					type: "string",
					enum: [
						"fromSender",
						"withSubject",
						"withAttachments",
						"largeEmails",
						"containingText",
						"mailingList",
					],
				},
				parameters: {
					type: "object",
					properties: {
						senderEmail: { type: "string" },
						subjectText: { type: "string" },
						searchText: { type: "string" },
						listIdentifier: { type: "string" },
						sizeInBytes: { type: "number" },
						labelIds: { type: "array", items: { type: "string" } },
						archive: { type: "boolean" },
						markAsRead: { type: "boolean" },
						markImportant: { type: "boolean" },
					},
				},
			},
			["template", "parameters"],
			false,
		),
		tool(
			"delete_filter",
			"Deletes a filter. Mail it already acted on is unaffected",
			{ filterId: { type: "string" } },
			["filterId"],
			false,
			true,
		),
	];
}
