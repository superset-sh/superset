import type { UseMastraChatDisplayReturn } from "@superset/chat-mastra/client";
import type { FileUIPart } from "ai";

type MastraMessage = NonNullable<
	UseMastraChatDisplayReturn["messages"]
>[number];
type MastraMessagePart = MastraMessage["content"][number];

interface AttachmentSource {
	url: string;
	mediaType: string;
	filename?: string;
}

export interface UserMessageDraft {
	text: string;
	files: FileUIPart[];
}

function getUserMessageText(message: MastraMessage): string {
	return message.content
		.flatMap((part) => (part.type === "text" ? [part.text] : []))
		.join("\n");
}

function toAttachmentSource(part: MastraMessagePart): AttachmentSource | null {
	const rawPart = part as {
		data?: string;
		filename?: string;
		image?: string;
		mediaType?: string;
		mimeType?: string;
		type?: string;
	};

	if (part.type !== "image" && rawPart.type !== "file") {
		return null;
	}

	const mediaType =
		rawPart.mediaType ?? rawPart.mimeType ?? "application/octet-stream";
	const data = rawPart.data ?? rawPart.image ?? "";
	if (!data) {
		return null;
	}

	if (part.type === "image" && "mimeType" in part && !rawPart.mediaType) {
		return {
			url: `data:${part.mimeType};base64,${part.data}`,
			mediaType: part.mimeType,
			filename: rawPart.filename,
		};
	}

	return {
		url: data,
		mediaType,
		filename: rawPart.filename,
	};
}

function getUserMessageAttachmentSources(
	message: MastraMessage,
): AttachmentSource[] {
	return message.content.flatMap((part) => {
		const attachment = toAttachmentSource(part);
		return attachment ? [attachment] : [];
	});
}

export function getUserMessageDraft(message: MastraMessage): UserMessageDraft {
	return {
		text: getUserMessageText(message),
		files: getUserMessageAttachmentSources(message).map((attachment) => ({
			type: "file",
			url: attachment.url,
			mediaType: attachment.mediaType,
			filename: attachment.filename,
		})),
	};
}
