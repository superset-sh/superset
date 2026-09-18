/**
 * TypeSafe usage. The `jev` CLI writes one session dir per shell under
 * `~/.typesafe/sessions/<id>/`, holding an `events.jsonl` whose
 * `usage_checkpointed` events carry CUMULATIVE per-model token totals;
 * consecutive checkpoints are diffed to get per-call deltas. The
 * `session_started` payload carries the workspace root.
 *
 * System One models answer in a single forward pass, so there is no cache and
 * no reasoning phase: the log reports input and output only, and both cache
 * fields stay zero.
 */

import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { UsageLogEntry } from "./parse";
import { forEachLine, num } from "./parse";

export function typesafeSessionsRoot(): string {
	return join(homedir(), ".typesafe", "sessions");
}

interface TypesafeModelUsage {
	model?: string;
	total_cost?: number;
	input_tokens?: number;
	output_tokens?: number;
	cache_read_tokens?: number;
	cache_write_tokens?: number;
}

interface TypesafeEventLine {
	timestamp_ms?: number;
	kind?: string;
	payload?: {
		workspace_root?: string;
		usage?: { models?: TypesafeModelUsage[] };
	};
}

/** Returns the number of session logs scanned. */
export async function collectTypesafeEntries(
	cutoffMs: number,
	out: UsageLogEntry[],
	root: string = typesafeSessionsRoot(),
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
		const previousByModel = new Map<string, Required<TypesafeModelUsage>>();
		await forEachLine(eventsPath, (line) => {
			if (
				!line.includes('"session_started"') &&
				!line.includes('"usage_checkpointed"')
			) {
				return;
			}
			let parsed: TypesafeEventLine;
			try {
				parsed = JSON.parse(line);
			} catch {
				return;
			}
			if (parsed.kind === "session_started") {
				cwd = parsed.payload?.workspace_root ?? cwd;
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

				const delta = (
					field: keyof Omit<Required<TypesafeModelUsage>, "model">,
				) => Math.max(0, current[field] - (previous?.[field] ?? 0));
				const input = delta("input_tokens");
				const cached = delta("cache_read_tokens");
				const cacheWrite = delta("cache_write_tokens");
				const output = delta("output_tokens");
				const cost = delta("total_cost");
				if (input + cached + cacheWrite + output === 0) continue;
				if (!timestampMs || timestampMs < cutoffMs) continue;

				out.push({
					agent: "typesafe",
					model: model.model,
					timestampMs,
					cwd,
					sessionId: sessionDir,
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
