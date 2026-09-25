import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectMuseEntries, parseMuseLine } from "./muse";
import type { UsageLogEntry } from "./parse";

// The real root sits under `~/.local/share`, so the fixture root gets a
// dot-dir ancestor too — only dot-dirs below the root are view caches.
const tmp = mkdtempSync(join(tmpdir(), "muse-usage-"));
const root = join(tmp, ".local", "share", "muse", "sessions");
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const SESSION = "01a092b6-70d4-7c61-97ee-ebb78fa63011";
const RUN = "489246d2-5c40-4d59-a6cd-4832e09a7bf5";
const NOW_MS = Date.now() - 60_000;
const NOW_US = NOW_MS * 1000;

let sequence = 0;
function envelope(
	payloadType: string,
	payload: Record<string, unknown>,
	recordedAtUs = NOW_US + sequence,
) {
	sequence += 1;
	return JSON.stringify({
		schema_version: 1,
		id: `rec-${sequence}`,
		stream: { kind: "session", id: SESSION },
		sequence,
		recorded_at: recordedAtUs,
		record_type: "event",
		durability: "durable",
		causation_id: null,
		payload_type: payloadType,
		payload_schema_version: 1,
		payload,
	});
}

function runEvent(
	event: Record<string, unknown>,
	sourceRunRecordId: string,
	recordedAtUs?: number,
) {
	return envelope(
		"runtime.session",
		{
			kind: "run",
			run_id: RUN,
			event,
			source_run_record_id: sourceRunRecordId,
			source_run_record_sequence: sequence,
		},
		recordedAtUs,
	);
}

const metadata = envelope("runtime.session.metadata", {
	kind: "metadata",
	record: {
		workspace_root: "/Users/me/proj",
		provider_id: "meta",
		model_id: "muse-spark-1.2",
	},
});

function writeSession(dir: string, lines: string[]) {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "session.jsonl"), `${lines.join("\n")}\n`);
}

describe("parseMuseLine", () => {
	test("reads the run record id, usage, and model off a model_completed mirror", () => {
		const parsed = parseMuseLine(
			runEvent(
				{
					kind: "model_completed",
					usage: {
						input_tokens: 1200,
						output_tokens: 80,
						cached_tokens: 900,
						reasoning_tokens: 20,
					},
					duration_ms: 8,
					model: "muse-spark-1.3",
				},
				"run-rec-1",
				1789167825478986,
			),
		);
		expect(parsed).toMatchObject({
			sessionId: SESSION,
			timestampMs: 1789167825478,
			recordId: "run-rec-1",
			completedModel: "muse-spark-1.3",
			usage: { input_tokens: 1200, cached_tokens: 900 },
		});
	});

	test("reads the record a real Meta-provider session writes (Muse Code 1.1.1)", () => {
		const parsed = parseMuseLine(
			runEvent(
				{
					kind: "model_completed",
					usage: {
						input_tokens: 28316,
						output_tokens: 22,
						cached_tokens: 0,
						cache_write_tokens: 0,
						cache_read_tokens: 0,
						reasoning_tokens: 11,
					},
					duration_ms: 11291,
					model: "muse-spark-1.3-contributor",
				},
				"226ca60b-42f2-4860-ab44-dc1a2bef4833",
				1789173576554136,
			),
		);
		expect(parsed).toMatchObject({
			timestampMs: 1789173576554,
			recordId: "226ca60b-42f2-4860-ab44-dc1a2bef4833",
			completedModel: "muse-spark-1.3-contributor",
			usage: { input_tokens: 28316, output_tokens: 22, reasoning_tokens: 11 },
		});
	});

	test("ignores lines that are not JSON envelopes", () => {
		expect(parseMuseLine("garbage")).toBeNull();
		expect(parseMuseLine('{"payload":null}')).toBeNull();
	});
});

describe("collectMuseEntries", () => {
	test("maps model_completed usage with the session's cwd, model, and prompt", async () => {
		const dir = join(root, "2026", "09", "11", SESSION);
		writeSession(dir, [
			metadata,
			runEvent({ kind: "started", prompt: "Refactor the sidebar\nmore" }, "r1"),
			runEvent(
				{
					kind: "model_completed",
					usage: {
						input_tokens: 1200,
						output_tokens: 80,
						cached_tokens: 900,
						reasoning_tokens: 20,
					},
					duration_ms: 8,
				},
				"r2",
			),
			runEvent({ kind: "terminal", terminal: "completed", reason: null }, "r3"),
		]);
		const out: UsageLogEntry[] = [];
		const labels = new Map<string, string>();
		const scanned = await collectMuseEntries(90, 0, out, labels, root);
		expect(scanned).toBe(1);
		expect(out).toEqual([
			{
				agent: "muse",
				model: "muse-spark-1.2",
				timestampMs: Math.floor((NOW_US + 2) / 1000),
				cwd: "/Users/me/proj",
				sessionId: SESSION,
				uncachedInput: 300,
				cachedInput: 900,
				cacheWrite5m: 0,
				cacheWrite1h: 0,
				output: 80,
				reasoningOutput: 20,
			},
		]);
		expect(labels.get(SESSION)).toBe("Refactor the sidebar");
	});

	test("dedupes a child run mirrored into the parent log and skips zero usage", async () => {
		const parentSession = "11111111-0000-7000-8000-000000000001";
		const parentDir = join(root, "2026", "09", "10", parentSession);
		const childDir = join(parentDir, "subagents", "child-1");
		const childCall = runEvent(
			{
				kind: "model_completed",
				usage: { input_tokens: 50, output_tokens: 5, cached_tokens: 0 },
			},
			"shared-run-record",
		);
		writeSession(parentDir, [
			metadata,
			childCall,
			runEvent(
				{
					kind: "model_completed",
					usage: { input_tokens: 0, output_tokens: 0, cached_tokens: 0 },
				},
				"echo-noop",
			),
		]);
		writeSession(childDir, [childCall]);
		const out: UsageLogEntry[] = [];
		await collectMuseEntries(90, 0, out, undefined, root);
		const shared = out.filter((entry) => entry.uncachedInput === 50);
		expect(shared).toHaveLength(1);
		expect(out.some((entry) => entry.uncachedInput + entry.output === 0)).toBe(
			false,
		);
	});

	test("drops calls before the cutoff and ignores view caches", async () => {
		const session = "22222222-0000-7000-8000-000000000002";
		writeSession(join(root, "2026", "09", "09", session), [
			metadata,
			runEvent(
				{
					kind: "model_completed",
					usage: { input_tokens: 10, output_tokens: 10 },
				},
				"old",
				(NOW_MS - 10 * 24 * 60 * 60 * 1000) * 1000,
			),
		]);
		writeSession(join(root, ".msp-view-v1", session), [
			runEvent(
				{
					kind: "model_completed",
					usage: { input_tokens: 10, output_tokens: 10 },
				},
				"cache-copy",
			),
		]);
		const out: UsageLogEntry[] = [];
		await collectMuseEntries(
			90,
			NOW_MS - 24 * 60 * 60 * 1000,
			out,
			undefined,
			root,
		);
		expect(out.some((entry) => entry.sessionId === session)).toBe(false);
	});

	test("missing root contributes nothing", async () => {
		const out: UsageLogEntry[] = [];
		const scanned = await collectMuseEntries(
			7,
			0,
			out,
			undefined,
			join(root, "absent"),
		);
		expect(scanned).toBe(0);
		expect(out).toHaveLength(0);
	});
});
