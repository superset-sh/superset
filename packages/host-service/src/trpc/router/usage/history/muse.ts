/**
 * Muse Code usage. Every session is an append-only JSONL event log at
 * `<data>/muse/sessions/YYYY/MM/DD/<session-id>/session.jsonl` (subagent
 * logs nest beneath their parent's directory). Each line is an envelope —
 * `recorded_at` in microseconds, a `payload_type`, the `payload` — and the
 * run stream is mirrored in as `runtime.session` records whose
 * `payload.event.kind === "model_completed"` carries the call's usage.
 * `input_tokens` INCLUDES the cached share, as with Codex. The cwd rides on
 * `runtime.session.metadata`, the label on the run's `started` prompt.
 * `source_run_record_id` names the run record itself, so a child run mirrored
 * into both its own and its parent's log dedupes on it.
 */

import { homedir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";
import type { LogFile } from "./logs";
import { collectLogFiles } from "./logs";
import type { UsageLogEntry } from "./parse";
import { forEachLine, num, toSessionLabel } from "./parse";

export function museSessionsRoot(): string {
	const dataHome =
		process.env.XDG_DATA_HOME?.trim() || join(homedir(), ".local", "share");
	return join(dataHome, "muse", "sessions");
}

interface MuseUsage {
	input_tokens?: number;
	prompt_tokens?: number;
	output_tokens?: number;
	cached_tokens?: number;
	cache_read_tokens?: number;
	cache_write_tokens?: number;
	reasoning_tokens?: number;
	cost_micros?: number;
}

interface MuseEnvelope {
	id?: string;
	stream?: { kind?: string; id?: string };
	recorded_at?: number;
	payload_type?: string;
	payload?: {
		kind?: string;
		source_run_record_id?: string;
		event?: {
			kind?: string;
			prompt?: string;
			model?: string;
			usage?: MuseUsage;
		};
		record?: { workspace_root?: string; model_id?: string };
	};
}

/** `recorded_at` is microseconds since the epoch; tolerate a milliseconds
 * value should the log schema change. */
function recordedAtMs(raw: unknown): number {
	if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return 0;
	return raw > 1e14 ? Math.floor(raw / 1000) : raw;
}

export interface ParsedMuseEnvelope {
	sessionId: string | null;
	timestampMs: number;
	recordId: string | null;
	workspaceRoot: string | null;
	modelId: string | null;
	prompt: string | null;
	usage: MuseUsage | null;
	completedModel: string | null;
}

export function parseMuseLine(line: string): ParsedMuseEnvelope | null {
	let envelope: MuseEnvelope;
	try {
		envelope = JSON.parse(line) as MuseEnvelope;
	} catch {
		return null;
	}
	const payload = envelope.payload;
	if (!payload || typeof payload !== "object") return null;
	const event = payload.kind === "run" ? payload.event : undefined;
	return {
		sessionId:
			envelope.stream?.kind === "session" &&
			typeof envelope.stream.id === "string"
				? envelope.stream.id
				: null,
		timestampMs: recordedAtMs(envelope.recorded_at),
		recordId:
			typeof payload.source_run_record_id === "string"
				? payload.source_run_record_id
				: typeof envelope.id === "string"
					? envelope.id
					: null,
		workspaceRoot:
			envelope.payload_type === "runtime.session.metadata" &&
			typeof payload.record?.workspace_root === "string"
				? payload.record.workspace_root
				: null,
		modelId:
			envelope.payload_type === "runtime.session.metadata" &&
			typeof payload.record?.model_id === "string"
				? payload.record.model_id
				: null,
		prompt:
			event?.kind === "started" && typeof event.prompt === "string"
				? event.prompt
				: null,
		usage:
			event?.kind === "model_completed" &&
			event.usage &&
			typeof event.usage === "object"
				? event.usage
				: null,
		completedModel:
			event?.kind === "model_completed" && typeof event.model === "string"
				? event.model
				: null,
	};
}

async function parseMuseLogFile(
	file: LogFile,
	cutoffMs: number,
	out: UsageLogEntry[],
	seenRecords: Set<string>,
	sessionLabels?: Map<string, string>,
): Promise<void> {
	let sessionId = basename(dirname(file.path));
	let cwd: string | null = null;
	let model: string | null = null;
	let label: string | null = null;
	const pending: UsageLogEntry[] = [];
	await forEachLine(file.path, (line) => {
		if (
			!line.includes('"model_completed"') &&
			!line.includes('"runtime.session.metadata"') &&
			!line.includes('"kind":"started"')
		) {
			return;
		}
		const parsed = parseMuseLine(line);
		if (!parsed) return;
		if (parsed.sessionId) sessionId = parsed.sessionId;
		if (parsed.workspaceRoot && !cwd) cwd = parsed.workspaceRoot;
		if (parsed.modelId && !model) model = parsed.modelId;
		if (parsed.prompt && !label) label = toSessionLabel(parsed.prompt);
		if (!parsed.usage) return;
		const usage = parsed.usage;
		const timestampMs = parsed.timestampMs || file.mtimeMs;
		if (timestampMs < cutoffMs) return;
		const recordId = parsed.recordId;
		if (recordId) {
			if (seenRecords.has(recordId)) return;
			seenRecords.add(recordId);
		}
		const input = num(usage.input_tokens ?? usage.prompt_tokens);
		const cachedInput =
			num(usage.cached_tokens) || num(usage.cache_read_tokens);
		const uncachedInput = Math.max(0, input - cachedInput);
		const cacheWrite = num(usage.cache_write_tokens);
		const output = num(usage.output_tokens);
		if (uncachedInput + cachedInput + cacheWrite + output === 0) return;
		const costMicros = num(usage.cost_micros);
		pending.push({
			agent: "muse",
			model: parsed.completedModel ?? model ?? "unknown",
			timestampMs,
			cwd,
			sessionId,
			uncachedInput,
			cachedInput,
			cacheWrite5m: cacheWrite,
			cacheWrite1h: 0,
			output,
			reasoningOutput: num(usage.reasoning_tokens),
			...(costMicros > 0 ? { costUsd: costMicros / 1e6 } : {}),
		});
	});
	// Metadata precedes the first model call, but a resumed log can re-stamp
	// the session id and cwd later — settle every entry once the file is read.
	for (const entry of pending) {
		entry.sessionId = sessionId;
		entry.cwd = entry.cwd ?? cwd;
		if (entry.model === "unknown" && model) entry.model = model;
		out.push(entry);
	}
	if (label && sessionLabels && !sessionLabels.has(sessionId)) {
		sessionLabels.set(sessionId, label);
	}
}

/** Returns the number of session logs scanned. */
export async function collectMuseEntries(
	days: number,
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
	root: string = museSessionsRoot(),
): Promise<number> {
	const files = (await collectLogFiles(root, days + 1)).filter(
		(file) =>
			basename(file.path) === "session.jsonl" &&
			// `.msp-view-v1/` and other dot-dirs under the root hold view caches,
			// not logs. Only segments below the root count — the root itself
			// normally sits under `~/.local`.
			!relative(root, file.path)
				.split(sep)
				.some((segment) => segment.startsWith(".")),
	);
	const seenRecords = new Set<string>();
	for (const file of files) {
		await parseMuseLogFile(file, cutoffMs, out, seenRecords, sessionLabels);
	}
	return files.length;
}
