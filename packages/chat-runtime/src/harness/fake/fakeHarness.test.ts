import { describe, expect, test } from "bun:test";
import {
	agentMessage,
	approvalRequest,
	sessionState,
	toolCall,
	turn,
	userMessage,
} from "../../testing/fixtures";
import type { AdapterEvent } from "../types";
import { FakeHarness, type FakeHarnessScript } from "./fakeHarness";

function drain(
	iterator: AsyncIterator<AdapterEvent>,
	count: number,
): Promise<AdapterEvent[]> {
	const events: AdapterEvent[] = [];
	const pull = async (): Promise<AdapterEvent[]> => {
		while (events.length < count) {
			const result = await iterator.next();
			if (result.done) return events;
			events.push(result.value);
		}
		return events;
	};
	return pull();
}

function approvalScript(): FakeHarnessScript {
	return {
		start: [{ kind: "session", session: sessionState({ status: "idle" }) }],
		turns: [
			[
				{ kind: "item", item: userMessage("u1", "hi"), turnId: "t1" },
				{ kind: "turn", turn: turn("t1") },
				{ kind: "item", item: toolCall("c1"), turnId: "t1" },
				{ kind: "item", item: approvalRequest("ap1"), turnId: "t1" },
				{
					kind: "item",
					item: toolCall("c1", { status: "completed" }),
					turnId: "t1",
				},
				{ kind: "item", item: agentMessage("a1", "done"), turnId: "t1" },
				{
					kind: "turn",
					turn: turn("t1", { status: "completed", completedAtMs: 2 }),
				},
			],
		],
	};
}

describe("FakeHarness", () => {
	test("yields start events, then a scripted turn per prompt", async () => {
		const harness = new FakeHarness({
			start: [{ kind: "session", session: sessionState({ status: "idle" }) }],
			turns: [
				[
					{ kind: "item", item: userMessage("u1", "hi"), turnId: "t1" },
					{ kind: "delta", delta: { type: "text", itemId: "a1", append: "d" } },
					{ kind: "item", item: agentMessage("a1", "done"), turnId: "t1" },
				],
			],
		});
		const iterator = harness.start({ cwd: "/tmp" })[Symbol.asyncIterator]();

		expect(await drain(iterator, 1)).toHaveLength(1);
		harness.prompt([{ type: "text", text: "hi" }]);
		const events = await drain(iterator, 3);
		expect(events.map((event) => event.kind)).toEqual([
			"item",
			"delta",
			"item",
		]);
		await harness.dispose();
	});

	test("pauses at a pending approval until respondToApproval", async () => {
		const harness = new FakeHarness(approvalScript());
		const iterator = harness.start({ cwd: "/tmp" })[Symbol.asyncIterator]();
		await drain(iterator, 1);
		harness.prompt([{ type: "text", text: "hi" }]);

		const gated = await drain(iterator, 4);
		expect(gated.at(-1)).toMatchObject({
			kind: "item",
			item: { id: "ap1", status: "pending" },
		});

		harness.respondToApproval("ap1", { type: "accept" });
		const rest = await drain(iterator, 4);
		expect(rest[0]).toMatchObject({
			kind: "item",
			item: { id: "ap1", status: "answered", decision: { type: "accept" } },
		});
		expect(rest.at(-1)).toMatchObject({
			kind: "turn",
			turn: { id: "t1", status: "completed" },
		});
		await harness.dispose();
	});

	test("cancelTurn interrupts the turn and cancels running tool calls", async () => {
		const harness = new FakeHarness({
			turns: [
				[
					{ kind: "turn", turn: turn("t1") },
					{ kind: "item", item: toolCall("c1"), turnId: "t1" },
					{
						kind: "item",
						item: agentMessage("a1", "never"),
						turnId: "t1",
						delayMs: 20,
					},
				],
			],
		});
		const iterator = harness.start({ cwd: "/tmp" })[Symbol.asyncIterator]();
		harness.prompt([{ type: "text", text: "hi" }]);
		await drain(iterator, 2);

		harness.cancelTurn();
		const settled = await drain(iterator, 2);
		expect(settled[0]).toMatchObject({
			kind: "item",
			item: { id: "c1", status: "canceled" },
		});
		expect(settled[1]).toMatchObject({
			kind: "turn",
			turn: { id: "t1", status: "interrupted" },
		});

		await harness.dispose();
		expect((await iterator.next()).done).toBe(true);
	});

	test("cancelTurn marks a pending approval stale", async () => {
		const harness = new FakeHarness(approvalScript());
		const iterator = harness.start({ cwd: "/tmp" })[Symbol.asyncIterator]();
		await drain(iterator, 1);
		harness.prompt([{ type: "text", text: "hi" }]);
		await drain(iterator, 4);

		harness.cancelTurn();
		const settled = await drain(iterator, 3);
		expect(settled.map((event) => event.kind)).toEqual([
			"item",
			"item",
			"turn",
		]);
		expect(settled[0]).toMatchObject({ item: { id: "ap1", status: "stale" } });
		expect(settled[1]).toMatchObject({
			item: { id: "c1", status: "canceled" },
		});
		await harness.dispose();
	});
});
