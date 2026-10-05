import type { BookkeepingReader } from "./types";
import { humanizeTag, xmlEnvelope, xmlField } from "./xmlEnvelope";

/** Claude Code's injected blocks, which it spells in kebab-case. */
const TAGS = new Set([
	"task-notification",
	"system-reminder",
	"command-name",
	"command-message",
	"command-args",
	"local-command-stdout",
]);

/**
 * A backgrounded subagent reports back through `task-notification`. The CLI
 * shows it as `Agent "…" finished · 17s`, which is the useful part of a block
 * otherwise full of ids and output paths.
 */
function taskNotification(body: string): string {
	const durationMs = Number(xmlField(body, "duration_ms") ?? Number.NaN);
	const suffix = Number.isFinite(durationMs)
		? ` · ${Math.round(durationMs / 1000)}s`
		: "";
	const summary = xmlField(body, "summary");
	if (summary) return `${summary}${suffix}`;
	const status = xmlField(body, "status");
	return `Background agent ${status ?? "update"}${suffix}`;
}

export const claudeBookkeeping: BookkeepingReader = {
	harnesses: ["claude-acp", "claude-code"],
	read(text) {
		const envelope = xmlEnvelope(text);
		if (!envelope || !TAGS.has(envelope.tag)) return null;
		return {
			label:
				envelope.tag === "task-notification"
					? taskNotification(envelope.body)
					: humanizeTag(envelope.tag),
		};
	},
};
