import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { collectLogFiles, dedupeRolloutFiles, type LogFile } from "./logs";

const root = mkdtempSync(join(tmpdir(), "usage-logs-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("collectLogFiles", () => {
	for (const path of [
		"2026/10/01/rollout-a.jsonl.zst",
		"2026/10/14/rollout-b.jsonl",
		"2026/10/14/notes.txt.zst",
	]) {
		mkdirSync(join(root, path, ".."), { recursive: true });
		writeFileSync(join(root, path), "");
	}

	async function collected(compressed?: boolean): Promise<string[]> {
		const files = await collectLogFiles(root, 1, { compressed });
		return files.map((file) => relative(root, file.path)).sort();
	}

	test("collects compressed rollouts only when asked", async () => {
		expect(await collected()).toEqual(["2026/10/14/rollout-b.jsonl"]);
		expect(await collected(true)).toEqual([
			"2026/10/01/rollout-a.jsonl.zst",
			"2026/10/14/rollout-b.jsonl",
		]);
	});
});

describe("dedupeRolloutFiles", () => {
	const files = (...paths: string[]): LogFile[] =>
		paths.map((path) => ({ path, mtimeMs: 0 }));

	test("keeps one file per rollout, preferring the plain one", () => {
		const kept = dedupeRolloutFiles(
			files(
				"/codex/sessions/2026/10/01/rollout-a.jsonl.zst",
				"/codex/sessions/2026/10/01/rollout-a.jsonl",
				"/codex/sessions/2026/10/02/rollout-b.jsonl",
				"/codex/archived_sessions/rollout-b.jsonl.zst",
				"/codex/archived_sessions/rollout-c.jsonl.zst",
				"/codex/sessions/2026/10/03/rollout-c.jsonl.zst",
			),
		);
		expect(kept.map((file) => basename(file.path))).toEqual([
			"rollout-a.jsonl",
			"rollout-b.jsonl",
			"rollout-c.jsonl.zst",
		]);
	});
});
