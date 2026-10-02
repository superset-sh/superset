import { claudeBookkeeping } from "./claude";
import { codexBookkeeping } from "./codex";
import { supersetBookkeeping } from "./superset";
import type { BookkeepingNote, BookkeepingReader } from "./types";

/** Add a harness by adding its reader here; nothing else has to change. */
const READERS: readonly BookkeepingReader[] = [
	claudeBookkeeping,
	codexBookkeeping,
];

export function readBookkeeping(
	harness: string | undefined,
	text: string,
): BookkeepingNote | null {
	// Ours first: it is the same block under every harness, and an unknown
	// harness still injects it.
	const own = supersetBookkeeping.read(text);
	if (own) return own;
	if (!harness) return null;
	const reader = READERS.find((candidate) =>
		candidate.harnesses.includes(harness),
	);
	return reader?.read(text) ?? null;
}
