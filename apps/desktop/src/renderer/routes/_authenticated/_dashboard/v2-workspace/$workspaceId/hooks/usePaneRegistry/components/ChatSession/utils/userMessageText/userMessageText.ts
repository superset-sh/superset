import type { UserMessage } from "@superset/chat/protocol";

export function userMessageText(item: UserMessage): string {
	return item.content
		.filter((content) => content.type === "text")
		.map((content) => content.text)
		.join("\n");
}
