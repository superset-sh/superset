import type { AgentIdentityId } from "@superset/shared/agent-catalog";
import { parseClaudeTitle } from "./claude";
import { readFileHead } from "./file-head";
import { toSessionQuery } from "./query";
import { HARNESS_SESSION_FILES } from "./transcript";
import type { HarnessSessionRef } from "./types";

/** Enough to reach the first real turn past a session's header records. */
const MAX_TITLE_SCAN_BYTES = 64 * 1024;
const MAX_TITLE_CHARS = 80;

/** Only harnesses whose store this can name a session from. */
const TITLE_PARSERS: Record<string, (raw: string) => string | null> = {
	claude: parseClaudeTitle,
};

/**
 * A name for a session, for a list that would otherwise read as ten rows of
 * the same workspace. Cheap enough for a list: only the head of the file is
 * read, never the whole conversation.
 */
export function readHarnessSessionTitle(ref: HarnessSessionRef): string | null {
	const resolved = toSessionQuery(ref);
	if (!resolved) return null;
	const parseTitle = TITLE_PARSERS[resolved.agentId];
	const files = HARNESS_SESSION_FILES[resolved.agentId as AgentIdentityId];
	if (!parseTitle || !files) return null;

	let path: string | null;
	try {
		path = files.locate(resolved.query);
	} catch {
		return null;
	}
	if (!path) return null;

	const raw = readFileHead(path, MAX_TITLE_SCAN_BYTES);
	if (raw === null) return null;
	const title = parseTitle(raw);
	if (!title) return null;

	const oneLine = title.replaceAll(/\s+/g, " ").trim();
	return oneLine.length > MAX_TITLE_CHARS
		? `${oneLine.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…`
		: oneLine;
}
