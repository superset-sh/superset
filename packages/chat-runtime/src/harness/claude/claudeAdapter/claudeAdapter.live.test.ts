import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AdapterEvent } from "../../types";
import { ClaudeAdapter } from "./claudeAdapter";

async function drain(
	iterator: AsyncIterator<AdapterEvent>,
	stop: (event: AdapterEvent) => boolean,
	limit = 400,
): Promise<AdapterEvent[]> {
	const events: AdapterEvent[] = [];
	for (let index = 0; index < limit; index += 1) {
		const result = await iterator.next();
		if (result.done) break;
		events.push(result.value);
		if (stop(result.value)) break;
	}
	return events;
}

describe.skip("ClaudeAdapter live", () => {
	test("prompts a real session, approves an edit, and settles the turn", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "claude-live-"));
		writeFileSync(join(cwd, "note.txt"), "foo\n");

		const adapter = new ClaudeAdapter({ query });
		const iterator = adapter
			.start({
				cwd,
				modelId: "claude-haiku-4-5-20251001",
			})
			[Symbol.asyncIterator]();

		adapter.prompt([
			{
				type: "text",
				text: "In note.txt replace foo with bar. Do not explain.",
			},
		]);

		let approvals = 0;
		const events = await drain(iterator, (event) => {
			if (event.kind === "item" && event.item.kind === "approval_request") {
				if (event.item.status === "pending") {
					approvals += 1;
					adapter.respondToApproval(event.item.id, { type: "accept" });
				}
				return false;
			}
			return event.kind === "turn" && event.turn.status !== "running";
		});

		expect(approvals).toBeGreaterThan(0);
		expect(events.at(-1)).toMatchObject({
			kind: "turn",
			turn: { status: "completed" },
		});
		expect(
			events.some(
				(event) =>
					event.kind === "item" &&
					event.item.kind === "tool_call" &&
					event.item.toolName === "Edit" &&
					event.item.status === "completed",
			),
		).toBe(true);

		await adapter.dispose();
	}, 120_000);
});
