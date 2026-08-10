import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentMessage } from "@superset/chat/protocol";
import type { AdapterEvent } from "../../types";
import { CodexAdapter } from "./codexAdapter";

// Live smoke against the codex binary on PATH. Run it by hand when the adapter
// changes: `bun test src/harness/codex/codexAdapter/codexLive.test.ts`, after
// swapping describe.skip for describe.
describe.skip("codexAdapter live", () => {
	test("a real app-server turn produces an agent message and a completed turn", async () => {
		const adapter = new CodexAdapter({
			command: process.env.CODEX_BIN ?? "codex",
		});
		const events: AdapterEvent[] = [];
		const cwd = mkdtempSync(join(tmpdir(), "codex-live-"));

		const pump = (async () => {
			for await (const event of adapter.start({ cwd, modeId: "read-only" })) {
				events.push(event);
				if (
					event.kind === "turn" &&
					event.turn.status !== "running" &&
					event.turn.status !== undefined
				) {
					break;
				}
			}
		})();

		adapter.prompt([
			{
				type: "text",
				text: "Reply with exactly the word: hello. Do not use any tools.",
			},
		]);

		await Promise.race([
			pump,
			new Promise((_resolve, reject) =>
				setTimeout(() => reject(new Error("live turn timed out")), 120_000),
			),
		]);
		await adapter.dispose();

		const message = events
			.flatMap((event) => (event.kind === "item" ? [event.item] : []))
			.filter((item): item is AgentMessage => item.kind === "agent_message")
			.at(-1);
		expect(message?.text.toLowerCase()).toContain("hello");

		const turn = events
			.flatMap((event) => (event.kind === "turn" ? [event.turn] : []))
			.at(-1);
		expect(turn?.status).toBe("completed");
	}, 130_000);
});
