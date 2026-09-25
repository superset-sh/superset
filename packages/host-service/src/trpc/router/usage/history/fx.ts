/**
 * fx usage. Each session dir under `~/.fx/sessions/<id>/` holds an
 * `events.jsonl` whose `usage_checkpointed` events carry CUMULATIVE per-model
 * token totals and a real cost; consecutive checkpoints are diffed to get
 * per-turn deltas (the global `~/.fx/usage.jsonl` has per-generation facts
 * but no session/cwd, so the session logs are the better source). The
 * `session_started` payload carries the workspace root.
 */

import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { UsageLogEntry } from "./parse";
import { forEachLine, num } from "./parse";

export function fxSessionsRoot(): string {
	return join(homedir(), ".fx", "sessions");
}

interface FxModelUsage {
	model?: string;
	total_cost?: number;
	input_tokens?: number;
	output_tokens?: number;
	cache_read_tokens?: number;
	cache_write_tokens?: number;
}

interface FxEventLine {
	timestamp_ms?: number;
	kind?: string;
	payload?: {
		workspace_root?: string;
		origin_workspace_root?: string;
		usage?: { models?: FxModelUsage[] };
	};
}

/** Returns the number of session logs scanned. */
export async function collectFxEntries(
	cutoffMs: number,
	out: UsageLogEntry[],
	root: string = fxSessionsRoot(),
): Promise<number> {
	let sessionDirs: string[];
	try {
		const entries = await readdir(root, { withFileTypes: true });
		sessionDirs = entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
	} catch {
		return 0;
	}

	let scanned = 0;
	for (const sessionDir of sessionDirs) {
		const eventsPath = join(root, sessionDir, "events.jsonl");
		try {
			if ((await stat(eventsPath)).mtimeMs < cutoffMs) continue;
		} catch {
			continue;
		}
		scanned++;

		let cwd: string | null = null;
		// Cumulative totals per model from the previous checkpoint.
		const previousByModel = new Map<string, Required<FxModelUsage>>();
		await forEachLine(eventsPath, (line) => {
			if (
				!line.includes('"session_started"') &&
				!line.includes('"usage_checkpointed"')
			) {
				return;
			}
			let parsed: FxEventLine;
			try {
				parsed = JSON.parse(line);
			} catch {
				return;
			}
			if (parsed.kind === "session_started") {
				cwd =
					parsed.payload?.workspace_root ??
					parsed.payload?.origin_workspace_root ??
					cwd;
				return;
			}
			if (parsed.kind !== "usage_checkpointed") return;
			const timestampMs = num(parsed.timestamp_ms);
			for (const model of parsed.payload?.usage?.models ?? []) {
				if (!model.model) continue;
				const current = {
					model: model.model,
					total_cost: num(model.total_cost),
					input_tokens: num(model.input_tokens),
					output_tokens: num(model.output_tokens),
					cache_read_tokens: num(model.cache_read_tokens),
					cache_write_tokens: num(model.cache_write_tokens),
				};
				const previous = previousByModel.get(model.model);
				previousByModel.set(model.model, current);

				const delta = (field: keyof Omit<Required<FxModelUsage>, "model">) =>
					Math.max(0, current[field] - (previous?.[field] ?? 0));
				const input = delta("input_tokens");
				const cached = delta("cache_read_tokens");
				const cacheWrite = delta("cache_write_tokens");
				const output = delta("output_tokens");
				const cost = delta("total_cost");
				if (input + cached + cacheWrite + output === 0) continue;
				if (!timestampMs || timestampMs < cutoffMs) continue;

				out.push({
					agent: "fx",
					model: model.model,
					timestampMs,
					cwd,
					sessionId: sessionDir,
					// fx fronts OpenAI-style APIs: input_tokens includes cached.
					uncachedInput: Math.max(0, input - cached),
					cachedInput: cached,
					cacheWrite5m: cacheWrite,
					cacheWrite1h: 0,
					output,
					reasoningOutput: 0,
					...(cost > 0 ? { costUsd: cost } : {}),
				});
			}
		});
	}
	return scanned;
}
