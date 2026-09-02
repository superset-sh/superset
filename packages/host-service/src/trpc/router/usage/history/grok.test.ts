import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectGrokEntries } from "./grok";
import type { UsageLogEntry } from "./parse";

const home = mkdtempSync(join(tmpdir(), "grok-usage-"));
afterAll(() => rmSync(home, { recursive: true, force: true }));

function writeFixture({
	sid,
	promptTokens,
	cachedTokens,
	ts,
}: {
	sid: string;
	promptTokens: number;
	cachedTokens: number;
	ts: string;
}) {
	mkdirSync(join(home, "logs"), { recursive: true });
	const line = JSON.stringify({
		ts,
		sid,
		msg: "shell.turn.inference_done",
		ctx: {
			prompt_tokens: promptTokens,
			cached_prompt_tokens: cachedTokens,
			completion_tokens: 40,
			reasoning_tokens: 15,
		},
	});
	const noise = JSON.stringify({ ts, sid, msg: "shell.turn.started", ctx: {} });
	writeFileSync(join(home, "logs", "unified.jsonl"), `${noise}\n${line}\n`);

	const sessionDir = join(home, "sessions", "%2Ftmp%2Fproj", sid);
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(
		join(sessionDir, "summary.json"),
		JSON.stringify({
			info: { id: sid, cwd: "/tmp/proj" },
			current_model_id: "grok-4.6",
			session_summary: "Fix the flaky test",
		}),
	);
}

describe("collectGrokEntries", () => {
	test("joins unified-log turns with session metadata", async () => {
		writeFixture({
			sid: "sid-1",
			promptTokens: 1000,
			cachedTokens: 600,
			ts: "2026-08-20T12:00:00.000Z",
		});
		const out: UsageLogEntry[] = [];
		const labels = new Map<string, string>();
		const scanned = await collectGrokEntries(home, 0, out, labels);
		expect(scanned).toBe(1);
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({
			agent: "grok",
			model: "grok-4.6",
			cwd: "/tmp/proj",
			sessionId: "sid-1",
			// prompt_tokens includes cached tokens (OpenAI-compatible API).
			uncachedInput: 400,
			cachedInput: 600,
			output: 40,
			reasoningOutput: 15,
		});
		expect(labels.get("sid-1")).toBe("Fix the flaky test");
	});

	test("drops turns before the cutoff", async () => {
		writeFixture({
			sid: "sid-2",
			promptTokens: 100,
			cachedTokens: 0,
			ts: "2026-08-20T12:00:00.000Z",
		});
		const out: UsageLogEntry[] = [];
		await collectGrokEntries(home, Date.parse("2026-08-21T00:00:00.000Z"), out);
		expect(out).toHaveLength(0);
	});

	test("missing home contributes nothing", async () => {
		const out: UsageLogEntry[] = [];
		const scanned = await collectGrokEntries(join(home, "absent"), 0, out);
		expect(scanned).toBe(0);
		expect(out).toHaveLength(0);
	});
});
