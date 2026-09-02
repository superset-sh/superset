/**
 * Grok CLI usage. Grok's per-session transcripts (chat_history.jsonl) carry
 * no token counts — the only local record is the CLI's unified log
 * (`$GROK_HOME/logs/unified.jsonl`), whose `shell.turn.inference_done`
 * events hold per-turn token usage keyed by session id. Model, cwd, and a
 * session title come from each session's `summary.json`
 * (`$GROK_HOME/sessions/<encoded-cwd>/<sid>/summary.json`), joined by sid.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { UsageLogEntry } from "./parse";
import { entryTimestamp, forEachLine, num } from "./parse";

export function grokHomes(): string[] {
	const homes = new Set<string>([join(homedir(), ".grok")]);
	const fromEnv = process.env.GROK_HOME?.trim();
	if (fromEnv) homes.add(fromEnv);
	return [...homes];
}

interface GrokUnifiedLine {
	ts?: string;
	sid?: string;
	msg?: string;
	ctx?: {
		prompt_tokens?: number;
		cached_prompt_tokens?: number;
		completion_tokens?: number;
		reasoning_tokens?: number;
	};
}

interface GrokSessionMeta {
	model: string | null;
	cwd: string | null;
	label: string | null;
}

// One corrupt or enormous sessions root must not stall the scan.
const MAX_SESSION_DIRS = 4096;

/**
 * Indexes `<home>/sessions/<encoded-cwd>/<sid>` by sid. Only summary.json is
 * read, and only for sids the caller actually saw in the unified log.
 */
async function indexGrokSessions(
	home: string,
	wantedSids: ReadonlySet<string>,
): Promise<Map<string, GrokSessionMeta>> {
	const meta = new Map<string, GrokSessionMeta>();
	const sessionsDir = join(home, "sessions");
	let groups: string[];
	try {
		const entries = await readdir(sessionsDir, { withFileTypes: true });
		groups = entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
	} catch {
		return meta;
	}
	let visited = 0;
	for (const group of groups) {
		let sids: string[];
		try {
			const entries = await readdir(join(sessionsDir, group), {
				withFileTypes: true,
			});
			sids = entries
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name);
		} catch {
			continue;
		}
		for (const sid of sids) {
			if (++visited > MAX_SESSION_DIRS) return meta;
			if (!wantedSids.has(sid) || meta.has(sid)) continue;
			try {
				const raw = await readFile(
					join(sessionsDir, group, sid, "summary.json"),
					"utf-8",
				);
				const summary = JSON.parse(raw) as {
					info?: { cwd?: string };
					current_model_id?: string;
					session_summary?: string;
					generated_title?: string;
				};
				meta.set(sid, {
					model:
						typeof summary.current_model_id === "string"
							? summary.current_model_id
							: null,
					cwd: typeof summary.info?.cwd === "string" ? summary.info.cwd : null,
					label: summary.session_summary || summary.generated_title || null,
				});
			} catch {
				// Missing/corrupt summary — the entries still count, unattributed.
			}
		}
	}
	return meta;
}

/**
 * Collects grok entries from one home. Returns the number of log files
 * scanned (0 or 1 per home).
 */
export async function collectGrokEntries(
	home: string,
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
): Promise<number> {
	const logPath = join(home, "logs", "unified.jsonl");
	let mtimeMs: number;
	try {
		mtimeMs = (await stat(logPath)).mtimeMs;
	} catch {
		return 0;
	}

	interface PendingEntry {
		sid: string;
		entry: UsageLogEntry;
	}
	const pending: PendingEntry[] = [];
	await forEachLine(logPath, (line) => {
		if (!line.includes('"shell.turn.inference_done"')) return;
		let parsed: GrokUnifiedLine;
		try {
			parsed = JSON.parse(line);
		} catch {
			return;
		}
		if (parsed.msg !== "shell.turn.inference_done") return;
		const ctx = parsed.ctx;
		const sid = typeof parsed.sid === "string" ? parsed.sid : "";
		if (!ctx || !sid) return;
		const timestampMs = entryTimestamp(parsed.ts, mtimeMs);
		if (timestampMs < cutoffMs) return;

		// xAI's API is OpenAI-compatible: prompt_tokens INCLUDES cached tokens.
		const prompt = num(ctx.prompt_tokens);
		const cached = num(ctx.cached_prompt_tokens);
		pending.push({
			sid,
			entry: {
				agent: "grok",
				model: "unknown",
				timestampMs,
				cwd: null,
				sessionId: sid,
				uncachedInput: Math.max(0, prompt - cached),
				cachedInput: cached,
				cacheWrite5m: 0,
				cacheWrite1h: 0,
				output: num(ctx.completion_tokens),
				// Reasoning is a subset of completion tokens — never added on top.
				reasoningOutput: num(ctx.reasoning_tokens),
			},
		});
	});
	if (pending.length === 0) return 1;

	const wanted = new Set(pending.map(({ sid }) => sid));
	const sessions = await indexGrokSessions(home, wanted);
	for (const { sid, entry } of pending) {
		const meta = sessions.get(sid);
		if (meta) {
			if (meta.model) entry.model = meta.model;
			entry.cwd = meta.cwd;
			if (meta.label) sessionLabels?.set(sid, meta.label);
		}
		out.push(entry);
	}
	return 1;
}
