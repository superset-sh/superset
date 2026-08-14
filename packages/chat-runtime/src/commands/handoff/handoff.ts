import type { DurableEnvelope } from "@superset/chat/protocol";
import { isKnownItem } from "@superset/chat/protocol";

const MAX_CHARS = 30_000;

export function projectTranscriptForHandoff(
	events: readonly DurableEnvelope[],
	options?: { untilItemId?: string; maxChars?: number },
): string {
	const lines: string[] = [];
	for (const envelope of events) {
		const event = envelope.event;
		if (event.type !== "item") continue;
		const item = event.item;
		if (!isKnownItem(item)) continue;
		if (item.kind === "user_message") {
			const text = item.content
				.map((part) => (part.type === "text" ? part.text : `[${part.type}]`))
				.join(" ");
			lines.push(`User: ${text}`);
		} else if (item.kind === "agent_message") {
			lines.push(`Assistant: ${item.text}`);
		} else if (item.kind === "tool_call") {
			lines.push(`[tool] ${item.toolKind} ${item.title} (${item.status})`);
		}
		if (options?.untilItemId && item.id === options.untilItemId) break;
	}
	let text = lines.join("\n\n");
	const maxChars = options?.maxChars ?? MAX_CHARS;
	if (text.length > maxChars) {
		text = `[earlier conversation truncated]\n\n${text.slice(text.length - maxChars)}`;
	}
	return text;
}

export function composeHandoffPreamble(seed: string, userText: string): string {
	return `<prior_conversation>\n${seed}\n</prior_conversation>\n\n${userText}`;
}
