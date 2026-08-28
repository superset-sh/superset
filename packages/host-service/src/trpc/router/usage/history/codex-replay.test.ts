import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectLogFiles, sortCodexFiles } from "./logs";
import { parseCodexLogFile, type UsageLogEntry } from "./parse";

const root = mkdtempSync(join(tmpdir(), "codex-replay-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

interface Turn {
	input: number;
	cached: number;
	output: number;
	reasoning: number;
}

interface Rollout {
	/** Session start / spawn instant, and the name the rollout is stored under. */
	start: string;
	/** Parent turns the fork re-emits, all stamped at `start`. */
	replayed?: Turn[];
	/** Turns this thread ran itself, at their own timestamps. */
	own?: Array<{ at: string; turn: Turn }>;
	/** Pre-0.145 rollouts leave `cache_write_input_tokens` out entirely. */
	omitCacheWrite?: boolean;
}

function counts(turn: Turn, omitCacheWrite: boolean) {
	return {
		input_tokens: turn.input,
		cached_input_tokens: turn.cached,
		...(omitCacheWrite ? {} : { cache_write_input_tokens: 0 }),
		output_tokens: turn.output,
		reasoning_output_tokens: turn.reasoning,
		total_tokens: turn.input + turn.output,
	};
}

let sequence = 0;

function writeRollout(dir: string, rollout: Rollout): void {
	const omitCacheWrite = rollout.omitCacheWrite ?? false;
	const replayed = rollout.replayed ?? [];
	const own = rollout.own ?? [];
	const lines: string[] = [
		JSON.stringify({
			timestamp: rollout.start,
			type: "session_meta",
			payload: { cwd: "/tmp/codex-project" },
		}),
		JSON.stringify({
			timestamp: rollout.start,
			type: "turn_context",
			payload: { model: "gpt-5.6-sol", cwd: "/tmp/codex-project" },
		}),
	];
	const running: Turn = { input: 0, cached: 0, output: 0, reasoning: 0 };
	const emit = (at: string, turn: Turn) => {
		running.input += turn.input;
		running.cached += turn.cached;
		running.output += turn.output;
		running.reasoning += turn.reasoning;
		lines.push(
			JSON.stringify({
				timestamp: at,
				type: "event_msg",
				payload: {
					type: "token_count",
					info: {
						total_token_usage: counts({ ...running }, omitCacheWrite),
						last_token_usage: counts(turn, omitCacheWrite),
						model_context_window: 258400,
					},
				},
			}),
		);
	};
	for (const turn of replayed) emit(rollout.start, turn);
	for (const { at, turn } of own) emit(at, turn);

	mkdirSync(dir, { recursive: true });
	const stamp = rollout.start.slice(0, 19).replace(/:/g, "-");
	const id = (sequence++).toString().padStart(12, "0");
	writeFileSync(
		join(dir, `rollout-${stamp}-019f-7a00-b000-${id}.jsonl`),
		`${lines.join("\n")}\n`,
	);
}

async function collect(
	dir: string,
	cutoffMs: number,
): Promise<UsageLogEntry[]> {
	const files = await collectLogFiles(dir, 31);
	// The directory walk yields no particular order, so hand the parser the
	// worst one: any chronology in the result is the production sort's doing.
	files.sort((a, b) => (a.path < b.path ? 1 : -1));
	const entries: UsageLogEntry[] = [];
	const seenTurnKeys = new Set<string>();
	for (const file of sortCodexFiles(files)) {
		await parseCodexLogFile(file, seenTurnKeys, cutoffMs, entries);
	}
	return entries;
}

function outputsByDay(entries: UsageLogEntry[]): Record<string, number[]> {
	const byDay = new Map<string, number[]>();
	for (const entry of entries) {
		const day = new Date(entry.timestampMs).toISOString().slice(0, 10);
		const outputs = byDay.get(day) ?? [];
		outputs.push(entry.output);
		outputs.sort((a, b) => a - b);
		byDay.set(day, outputs);
	}
	return Object.fromEntries(byDay);
}

// P1 and P3 cost exactly the same: keyed on the delta alone they would
// collapse into one turn, so the thread's running total has to be part of it.
const P1: Turn = { input: 20_000, cached: 11_000, output: 200, reasoning: 60 };
const P2: Turn = { input: 27_000, cached: 23_000, output: 320, reasoning: 90 };
const P3: Turn = { input: 20_000, cached: 11_000, output: 200, reasoning: 60 };
const PARENT_OUTPUT = [P1.output, P2.output, P3.output].sort((a, b) => a - b);
const OWN_A: Turn = {
	input: 31_000,
	cached: 27_000,
	output: 700,
	reasoning: 0,
};
const OWN_B: Turn = {
	input: 33_000,
	cached: 28_000,
	output: 900,
	reasoning: 0,
};

const CUTOFF = Date.parse("2026-08-01T00:00:00.000Z");

describe("parseCodexLogFile across forked rollouts", () => {
	test("counts a replayed history once, on the day the thread spent it", async () => {
		const dir = join(root, "in-window");
		writeRollout(dir, {
			start: "2026-08-20T10:00:00.000Z",
			own: [
				{ at: "2026-08-20T10:00:00.000Z", turn: P1 },
				{ at: "2026-08-20T10:05:00.000Z", turn: P2 },
				{ at: "2026-08-20T10:10:00.000Z", turn: P3 },
			],
			omitCacheWrite: true,
		});
		for (const [start, own] of [
			["2026-08-21T09:00:00.000Z", OWN_A],
			["2026-08-21T09:30:00.000Z", OWN_B],
		] as const) {
			writeRollout(dir, {
				start,
				replayed: [P1, P2, P3],
				own: [{ at: start, turn: own }],
			});
		}

		const entries = await collect(dir, CUTOFF);

		expect(outputsByDay(entries)).toEqual({
			"2026-08-20": PARENT_OUTPUT,
			"2026-08-21": [OWN_A.output, OWN_B.output],
		});
		expect(entries).toHaveLength(5);
	});

	test("a replay of turns older than the window adds nothing", async () => {
		const dir = join(root, "crossing-cutoff");
		writeRollout(dir, {
			start: "2026-07-01T10:00:00.000Z",
			own: [
				{ at: "2026-07-01T10:00:00.000Z", turn: P1 },
				{ at: "2026-07-01T10:05:00.000Z", turn: P2 },
				{ at: "2026-07-01T10:10:00.000Z", turn: P3 },
			],
			omitCacheWrite: true,
		});
		for (const [start, own] of [
			["2026-08-21T09:00:00.000Z", OWN_A],
			["2026-08-21T09:30:00.000Z", OWN_B],
		] as const) {
			writeRollout(dir, {
				start,
				replayed: [P1, P2, P3],
				own: [{ at: start, turn: own }],
			});
		}

		const entries = await collect(dir, CUTOFF);

		expect(outputsByDay(entries)).toEqual({
			"2026-08-21": [OWN_A.output, OWN_B.output],
		});
	});
});
