import type { BookkeepingReader } from "./types";
import { humanizeTag, xmlEnvelope } from "./xmlEnvelope";

/**
 * Blocks we inject ourselves, so they arrive whatever the harness is and this
 * reader claims no harness of its own — the registry always consults it.
 */
const TAGS = new Set(["roster"]);

export const supersetBookkeeping: BookkeepingReader = {
	harnesses: [],
	read(text) {
		const envelope = xmlEnvelope(text);
		if (!envelope || !TAGS.has(envelope.tag)) return null;
		return { label: humanizeTag(envelope.tag) };
	},
};
