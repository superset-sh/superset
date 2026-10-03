import type { BookkeepingReader } from "./types";
import { humanizeTag, xmlEnvelope } from "./xmlEnvelope";

/**
 * Codex briefs a session with context blocks rather than notifications, and
 * spells them in snake_case. Taken from its protocol definitions
 * (codex-rs/protocol/src/protocol.rs), not guessed.
 */
const TAGS = new Set([
	"environment_context",
	"user_instructions",
	"apps_instructions",
	"environments_instructions",
	"plugins_instructions",
	"skills_instructions",
	"collaboration_mode",
	"multi_agent_mode",
	"context_window_guidance",
]);

export const codexBookkeeping: BookkeepingReader = {
	harnesses: ["codex-acp", "codex"],
	read(text) {
		const envelope = xmlEnvelope(text);
		if (!envelope || !TAGS.has(envelope.tag)) return null;
		return { label: humanizeTag(envelope.tag) };
	},
};
