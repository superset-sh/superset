import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectFxEntries } from "./fx";
import type { UsageLogEntry } from "./parse";

const root = mkdtempSync(join(tmpdir(), "fx-usage-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const NOW = Date.now() - 60_000;

function checkpoint(
	timestampMs: number,
	models: Array<Record<string, unknown>>,
) {
	return {
		timestamp_ms: timestampMs,
		kind: "usage_checkpointed",
		payload: { usage: { models } },
	};
}

describe("collectFxEntries", () => {
	test("diffs cumulative checkpoints into per-turn entries", async () => {
		const dir = join(root, "session-1");
		mkdirSync(dir, { recursive: true });
		const lines = [
			{
				timestamp_ms: NOW - 10_000,
				kind: "session_started",
				payload: { workspace_root: "/tmp/proj" },
			},
			checkpoint(NOW - 5_000, [
				{
					model: "zai/glm-5.2",
					total_cost: 0.02,
					input_tokens: 16_000,
					output_tokens: 4,
					cache_read_tokens: 12_000,
					cache_write_tokens: 0,
				},
			]),
			checkpoint(NOW, [
				{
					model: "zai/glm-5.2",
					total_cost: 0.05,
					input_tokens: 40_000,
					output_tokens: 104,
					cache_read_tokens: 30_000,
					cache_write_tokens: 100,
				},
			]),
		];
		writeFileSync(
			join(dir, "events.jsonl"),
			lines.map((line) => JSON.stringify(line)).join("\n"),
		);

		const out: UsageLogEntry[] = [];
		const scanned = await collectFxEntries(0, out, root);
		expect(scanned).toBe(1);
		expect(out).toHaveLength(2);
		expect(out[0]).toMatchObject({
			agent: "fx",
			model: "zai/glm-5.2",
			cwd: "/tmp/proj",
			sessionId: "session-1",
			// input_tokens includes cached tokens (OpenAI-style API).
			uncachedInput: 4_000,
			cachedInput: 12_000,
			output: 4,
			costUsd: 0.02,
		});
		expect(out[1]).toMatchObject({
			uncachedInput: 6_000,
			cachedInput: 18_000,
			cacheWrite5m: 100,
			output: 100,
		});
		expect(out[1]?.costUsd).toBeCloseTo(0.03, 10);
	});

	test("pre-cutoff checkpoints still advance the baseline", async () => {
		const dir = join(root, "session-2");
		mkdirSync(dir, { recursive: true });
		const lines = [
			checkpoint(NOW - 5_000, [
				{ model: "m", total_cost: 0, input_tokens: 100, output_tokens: 10 },
			]),
			checkpoint(NOW, [
				{ model: "m", total_cost: 0, input_tokens: 150, output_tokens: 15 },
			]),
		];
		writeFileSync(
			join(dir, "events.jsonl"),
			lines.map((line) => JSON.stringify(line)).join("\n"),
		);
		const out: UsageLogEntry[] = [];
		await collectFxEntries(NOW - 1_000, out, root);
		const sessionEntries = out.filter((e) => e.sessionId === "session-2");
		expect(sessionEntries).toHaveLength(1);
		expect(sessionEntries[0]).toMatchObject({
			uncachedInput: 50,
			output: 5,
		});
	});

	test("missing root contributes nothing", async () => {
		const out: UsageLogEntry[] = [];
		const scanned = await collectFxEntries(0, out, join(root, "absent"));
		expect(scanned).toBe(0);
		expect(out).toHaveLength(0);
	});
});
