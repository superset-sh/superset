/**
 * Pi / Oh My Pi usage (omp is a pi fork with the same session format).
 * Sessions are JSONL trees under `~/.pi/agent/sessions/--<encoded-cwd>--/`
 * (resp. `~/.omp/...`): a `{type:"session"}` header carrying the cwd, then
 * `{type:"message"}` entries whose assistant messages hold the model and a
 * usage block (input/output/cacheRead/cacheWrite plus a computed cost).
 * Entries are appended exactly once each — branching is by parent id — so no
 * cross-file dedupe is needed.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import type { UsageAgent } from "../types";
import type { LogFile } from "./logs";
import { collectLogFiles } from "./logs";
import type { UsageLogEntry } from "./parse";
import {
	entryTimestamp,
	forEachLine,
	num,
	sessionIdForFile,
	toSessionLabel,
} from "./parse";

export function piSessionsRoot(agent: "pi" | "omp"): string {
	return join(homedir(), `.${agent}`, "agent", "sessions");
}

interface PiLine {
	type?: string;
	timestamp?: string;
	cwd?: string;
	message?: {
		role?: string;
		model?: string;
		timestamp?: number;
		content?: string | Array<{ type?: string; text?: string }>;
		usage?: {
			input?: number;
			output?: number;
			cacheRead?: number;
			cacheWrite?: number;
			cost?: { total?: number };
		};
	};
}

async function parsePiLogFile(
	agent: UsageAgent,
	file: LogFile,
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
): Promise<void> {
	const sessionId = sessionIdForFile(file.path);
	let sessionCwd: string | null = null;
	await forEachLine(file.path, (line) => {
		const wantLabel = sessionLabels ? !sessionLabels.has(sessionId) : false;
		if (
			!line.includes('"session"') &&
			!line.includes('"assistant"') &&
			!(wantLabel && line.includes('"user"'))
		) {
			return;
		}
		let parsed: PiLine;
		try {
			parsed = JSON.parse(line);
		} catch {
			return;
		}
		if (parsed.type === "session") {
			if (typeof parsed.cwd === "string") sessionCwd = parsed.cwd;
			return;
		}
		if (parsed.type !== "message") return;
		const message = parsed.message;
		if (!message) return;

		if (wantLabel && message.role === "user") {
			const content = message.content;
			const text =
				typeof content === "string"
					? content
					: content?.find((block) => block.type === "text")?.text;
			const label = toSessionLabel(text);
			if (label) sessionLabels?.set(sessionId, label);
			return;
		}
		if (message.role !== "assistant") return;
		const usage = message.usage;
		if (!usage || !message.model) return;

		const timestampMs =
			typeof message.timestamp === "number" && message.timestamp > 0
				? message.timestamp
				: entryTimestamp(parsed.timestamp, file.mtimeMs);
		if (timestampMs < cutoffMs) return;

		const cost = num(usage.cost?.total);
		out.push({
			agent,
			model: message.model,
			timestampMs,
			cwd: sessionCwd,
			sessionId,
			// Pi stores the agent-reported input count, which excludes the
			// cache fields it tracks separately.
			uncachedInput: num(usage.input),
			cachedInput: num(usage.cacheRead),
			cacheWrite5m: num(usage.cacheWrite),
			cacheWrite1h: 0,
			output: num(usage.output),
			reasoningOutput: 0,
			...(cost > 0 ? { costUsd: cost } : {}),
		});
	});
}

/** Returns the number of session files scanned. */
export async function collectPiEntries(
	agent: "pi" | "omp",
	days: number,
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
	root: string = piSessionsRoot(agent),
): Promise<number> {
	const files = await collectLogFiles(root, days + 1);
	for (const file of files) {
		await parsePiLogFile(agent, file, cutoffMs, out, sessionLabels);
	}
	return files.length;
}
