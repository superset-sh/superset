import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UsageLogEntry } from "./parse";
import { collectTypesafeEntries } from "./typesafe";

const root = mkdtempSync(join(tmpdir(), "typesafe-usage-"));
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

describe("collectTypesafeEntries", () => {
	test("diffs cumulative checkpoints into per-call entries", async () => {
		const dir = join(root, "2026-09-17-1234");
		mkdirSync(dir, { recursive: true });
		const lines = [
			{
				timestamp_ms: NOW - 10_000,
				kind: "session_started",
				payload: { workspace_root: "/tmp/proj" },
			},
			checkpoint(NOW - 5_000, [
				{
					model: "jev-1.13.0",
					total_cost: 0,
					input_tokens: 271,
					output_tokens: 20,
					cache_read_tokens: 0,
					cache_write_tokens: 0,
				},
			]),
			checkpoint(NOW, [
				{
					model: "jev-1.13.0",
					total_cost: 0,
					input_tokens: 543,
					output_tokens: 40,
					cache_read_tokens: 0,
					cache_write_tokens: 0,
				},
			]),
		];
		writeFileSync(
			join(dir, "events.jsonl"),
			lines.map((line) => JSON.stringify(line)).join("\n"),
		);

		const out: UsageLogEntry[] = [];
		const scanned = await collectTypesafeEntries(0, out, root);
		expect(scanned).toBe(1);
		expect(out).toHaveLength(2);
		expect(out[0]).toMatchObject({
			agent: "typesafe",
			model: "jev-1.13.0",
			cwd: "/tmp/proj",
			sessionId: "2026-09-17-1234",
			uncachedInput: 271,
			cachedInput: 0,
			output: 20,
		});
		// A free tier reports total_cost 0, so no costUsd overrides the rate table.
		expect(out[0]?.costUsd).toBeUndefined();
		expect(out[1]).toMatchObject({ uncachedInput: 272, output: 20 });
	});

	test("pre-cutoff checkpoints still advance the baseline", async () => {
		const dir = join(root, "session-2");
		mkdirSync(dir, { recursive: true });
		const lines = [
			checkpoint(NOW - 5_000, [
				{ model: "jev", total_cost: 0, input_tokens: 100, output_tokens: 10 },
			]),
			checkpoint(NOW, [
				{ model: "jev", total_cost: 0, input_tokens: 150, output_tokens: 15 },
			]),
		];
		writeFileSync(
			join(dir, "events.jsonl"),
			lines.map((line) => JSON.stringify(line)).join("\n"),
		);
		const out: UsageLogEntry[] = [];
		await collectTypesafeEntries(NOW - 1_000, out, root);
		const sessionEntries = out.filter((e) => e.sessionId === "session-2");
		expect(sessionEntries).toHaveLength(1);
		expect(sessionEntries[0]).toMatchObject({
			uncachedInput: 50,
			output: 5,
		});
	});

	test("missing root contributes nothing", async () => {
		const out: UsageLogEntry[] = [];
		const scanned = await collectTypesafeEntries(0, out, join(root, "absent"));
		expect(scanned).toBe(0);
		expect(out).toHaveLength(0);
	});
});
