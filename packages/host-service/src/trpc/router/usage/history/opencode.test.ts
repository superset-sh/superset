import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectOpencodeEntries } from "./opencode";
import type { UsageLogEntry } from "./parse";

const storage = mkdtempSync(join(tmpdir(), "opencode-usage-"));
afterAll(() => rmSync(storage, { recursive: true, force: true }));

const SESSION = "ses_test1";
const NOW = Date.parse("2026-08-20T12:00:00.000Z");

function writeMessage(name: string, message: Record<string, unknown>) {
	const dir = join(storage, "message", SESSION);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, name), JSON.stringify(message));
}

describe("collectOpencodeEntries", () => {
	test("maps assistant messages with their recorded cost", async () => {
		writeMessage("msg_1.json", {
			sessionID: SESSION,
			role: "assistant",
			time: { created: NOW - 500, completed: NOW },
			modelID: "claude-sonnet-5",
			providerID: "anthropic",
			path: { cwd: "/tmp/proj" },
			cost: 0.042,
			tokens: {
				input: 120,
				output: 300,
				reasoning: 40,
				cache: { read: 900, write: 80 },
			},
		});
		writeMessage("msg_2.json", {
			sessionID: SESSION,
			role: "user",
			time: { created: NOW },
		});
		const sessionMetaDir = join(storage, "session", "projhash");
		mkdirSync(sessionMetaDir, { recursive: true });
		writeFileSync(
			join(sessionMetaDir, `${SESSION}.json`),
			JSON.stringify({ id: SESSION, title: "Refactor the sidebar" }),
		);

		const out: UsageLogEntry[] = [];
		const labels = new Map<string, string>();
		const scanned = await collectOpencodeEntries(0, out, labels, storage);
		expect(scanned).toBe(2);
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({
			agent: "opencode",
			model: "claude-sonnet-5",
			cwd: "/tmp/proj",
			sessionId: SESSION,
			uncachedInput: 120,
			cachedInput: 900,
			cacheWrite5m: 80,
			output: 300,
			reasoningOutput: 40,
			costUsd: 0.042,
		});
		expect(labels.get(SESSION)).toBe("Refactor the sidebar");
	});

	test("drops messages before the cutoff", async () => {
		const out: UsageLogEntry[] = [];
		await collectOpencodeEntries(NOW + 1, out, undefined, storage);
		expect(out).toHaveLength(0);
	});

	test("missing storage contributes nothing", async () => {
		const out: UsageLogEntry[] = [];
		const scanned = await collectOpencodeEntries(
			0,
			out,
			undefined,
			join(storage, "absent"),
		);
		expect(scanned).toBe(0);
		expect(out).toHaveLength(0);
	});
});
