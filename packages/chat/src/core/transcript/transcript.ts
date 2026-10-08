import type { Turn } from "../../protocol/envelope";
import type {
	Item,
	ToolCall,
	UserContent,
	UserMessage,
} from "../../protocol/items";

/** A user message is keyed by its client id, so a sent prompt and its echo are one row. */
export function transcriptItemKey(item: Item): string {
	return item.kind === "user_message"
		? ((item as UserMessage).clientId ?? item.id)
		: item.id;
}

export function toolRunKey(
	turnId: string,
	items: readonly ToolCall[],
	index: number,
): string {
	return `tools:${turnId}:${items[0]?.id ?? index}`;
}

export function runningTurnId(turns: ReadonlyMap<string, Turn>): string | null {
	for (const turn of turns.values()) {
		if (turn.status === "running") return turn.id;
	}
	return null;
}

export function userMessageText(
	message: { content: readonly UserContent[] },
	separator = "\n",
): string {
	return message.content
		.flatMap((part) => (part.type === "text" ? [part.text] : []))
		.join(separator);
}
