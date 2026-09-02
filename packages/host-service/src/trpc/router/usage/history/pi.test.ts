import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UsageLogEntry } from "./parse";
import { collectPiEntries } from "./pi";

const root = mkdtempSync(join(tmpdir(), "pi-usage-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const NOW = Date.now() - 60_000;

describe("collectPiEntries", () => {
	test("reads header cwd, assistant usage, and a session label", async () => {
		const dir = join(root, "--tmp-proj--");
		mkdirSync(dir, { recursive: true });
		const lines = [
			{
				type: "session",
				id: "s1",
				timestamp: new Date(NOW).toISOString(),
				cwd: "/tmp/proj",
			},
			{
				type: "message",
				timestamp: new Date(NOW).toISOString(),
				message: { role: "user", content: "Add retry logic", timestamp: NOW },
			},
			{
				type: "message",
				timestamp: new Date(NOW).toISOString(),
				message: {
					role: "assistant",
					model: "gpt-5.6",
					timestamp: NOW,
					usage: {
						input: 150,
						output: 220,
						cacheRead: 700,
						cacheWrite: 30,
						cost: { total: 0.0123 },
					},
				},
			},
		];
		writeFileSync(
			join(dir, "abc.jsonl"),
			lines.map((line) => JSON.stringify(line)).join("\n"),
		);

		const out: UsageLogEntry[] = [];
		const labels = new Map<string, string>();
		const scanned = await collectPiEntries("omp", 30, 0, out, labels, root);
		expect(scanned).toBe(1);
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({
			agent: "omp",
			model: "gpt-5.6",
			cwd: "/tmp/proj",
			sessionId: "abc",
			uncachedInput: 150,
			cachedInput: 700,
			cacheWrite5m: 30,
			output: 220,
			costUsd: 0.0123,
		});
		expect(labels.get("abc")).toBe("Add retry logic");
	});

	test("missing root contributes nothing", async () => {
		const out: UsageLogEntry[] = [];
		const scanned = await collectPiEntries(
			"pi",
			30,
			0,
			out,
			undefined,
			join(root, "absent"),
		);
		expect(scanned).toBe(0);
		expect(out).toHaveLength(0);
	});
});
