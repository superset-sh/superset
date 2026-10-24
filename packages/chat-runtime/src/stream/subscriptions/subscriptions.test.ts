import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { emptySnapshot, reduceMany } from "@superset/chat/core";
import type { Cursor, Envelope } from "@superset/chat/protocol";
import { isDeltaEnvelope, isDurableEnvelope } from "@superset/chat/protocol";
import type { FakeHarnessScript } from "../../harness/fake";
import type { ChatRuntime } from "../../index";
import {
	agentMessage,
	approvalRequest,
	toolCall,
	turn,
	userMessage,
} from "../../testing/fixtures";
import { createTestRuntime } from "../../testing/testRuntime";
import {
	createManualSchedule,
	createRecordingSink,
	FAKE_HARNESS,
	fakeHarnessRegistry,
	waitFor,
} from "../../testing/testUtils";

const STREAMING_TURN: FakeHarnessScript = {
	turns: [
		[
			{ type: "turn", turn: turn("t1") },
			{ type: "delta", delta: { type: "text", itemId: "a1", append: "a" } },
			{ type: "delta", delta: { type: "text", itemId: "a1", append: "b" } },
			{ type: "delta", delta: { type: "text", itemId: "a1", append: "c" } },
			{ type: "item", item: agentMessage("a1", "abc"), turnId: "t1" },
			{
				type: "turn",
				turn: turn("t1", { status: "completed", completedAtMs: 2 }),
			},
			{ type: "session", session: { status: "idle" } },
		],
	],
};

const SUBAGENT_TURN: FakeHarnessScript = {
	turns: [
		[
			{ type: "turn", turn: turn("t1") },
			{
				type: "item",
				item: toolCall("subagent:c", { subagent: true, toolName: "subagent" }),
				turnId: "t1",
			},
			{
				type: "item",
				item: userMessage("sub:c:u", "task", {
					parentItemId: "subagent:c",
					from: "parent",
				}),
				turnId: "t1",
			},
			{
				type: "delta",
				delta: {
					type: "text",
					itemId: "sub:c:a",
					append: "child",
					parentItemId: "subagent:c",
				},
			},
			{
				type: "item",
				item: {
					...agentMessage("sub:c:a", "child"),
					parentItemId: "subagent:c",
				},
				turnId: "t1",
			},
			{
				type: "item",
				item: toolCall("subagent:d", {
					subagent: true,
					parentItemId: "subagent:c",
				}),
				turnId: "t1",
			},
			{
				type: "delta",
				delta: { type: "background", itemId: "subagent:d", append: "ls" },
			},
			{
				type: "item",
				item: toolCall("sub:d:t", { parentItemId: "subagent:d" }),
				turnId: "t1",
			},
			{ type: "item", item: toolCall("task-1"), turnId: "t1" },
			{
				type: "item",
				item: toolCall("task-1:read", { parentItemId: "task-1" }),
				turnId: "t1",
			},
			{ type: "delta", delta: { type: "text", itemId: "a1", append: "main" } },
			{ type: "item", item: agentMessage("a1", "main"), turnId: "t1" },
			{
				type: "item",
				item: approvalRequest("approval:sub:d:t", {
					parentItemId: "subagent:d",
					targetItemId: "sub:d:t",
				}),
				turnId: "t1",
			},
		],
	],
};

const FLAT_ITEM_IDS = [
	"subagent:c",
	"task-1",
	"task-1:read",
	"a1",
	"approval:sub:d:t",
];

function itemIdsOf(envelopes: Envelope[]): string[] {
	return [
		...new Set(
			envelopes.flatMap((envelope) =>
				isDurableEnvelope(envelope) &&
				envelope.event.type === "item" &&
				!(
					envelope.event.item.kind === "user_message" &&
					!envelope.event.item.parentItemId
				)
					? [envelope.event.item.id]
					: [],
			),
		),
	];
}

function deltaItemIdsOf(envelopes: Envelope[]): string[] {
	return envelopes.flatMap((envelope) =>
		isDeltaEnvelope(envelope) ? [envelope.delta.itemId] : [],
	);
}

async function askedForApproval(
	runtime: ChatRuntime,
	sessionId: string,
): Promise<void> {
	const watcher = createRecordingSink();
	runtime.subscribe(sessionId, { deltas: [] }, watcher.sink);
	await waitFor(() =>
		itemIdsOf(watcher.envelopes).includes("approval:sub:d:t"),
	);
}

function startRuntime(script: FakeHarnessScript): {
	runtime: ChatRuntime;
	sessionId: string;
} {
	const { harnesses } = fakeHarnessRegistry(script);
	const manual = createManualSchedule();
	const runtime = createTestRuntime({ harnesses, schedule: manual.schedule });
	const { sessionId } = runtime.commands.createSession({
		commandId: randomUUID(),
		scopeId: "workspace-1",
		harness: FAKE_HARNESS,
		cwd: "/tmp/workspace",
	});
	return { runtime, sessionId };
}

function prompt(runtime: ChatRuntime, sessionId: string): void {
	runtime.commands.prompt({
		commandId: randomUUID(),
		sessionId,
		clientId: "client-1",
		content: [{ type: "text", text: "go" }],
	});
}

function lastCursor(envelopes: Envelope[]): Cursor | undefined {
	for (let index = envelopes.length - 1; index >= 0; index -= 1) {
		const envelope = envelopes[index];
		if (envelope && isDurableEnvelope(envelope)) return envelope.cursor;
	}
	return undefined;
}

describe("SubscriptionHub", () => {
	test("a reconnecting subscriber converges with one that never dropped", async () => {
		const { runtime, sessionId } = startRuntime(STREAMING_TURN);
		const always = createRecordingSink();
		const dropper = createRecordingSink();
		runtime.subscribe(sessionId, { deltas: [] }, always.sink);
		const first = runtime.subscribe(sessionId, { deltas: [] }, dropper.sink);

		prompt(runtime, sessionId);
		await waitFor(() => dropper.envelopes.length >= 3);
		first.unsubscribe();
		const since = lastCursor(dropper.envelopes);
		const droppedAt = dropper.envelopes.length;

		await waitFor(() => runtime.sessions.get(sessionId)?.status === "idle");
		expect(dropper.envelopes).toHaveLength(droppedAt);

		const resumed = createRecordingSink();
		runtime.subscribe(sessionId, { since, deltas: [] }, resumed.sink);

		const reconnected = [...dropper.envelopes, ...resumed.envelopes];
		expect(reconnected).toEqual(always.envelopes);
		expect(reduceMany(emptySnapshot(), reconnected)).toEqual(
			reduceMany(emptySnapshot(), always.envelopes),
		);
		await runtime.dispose();
	});

	test("a stale-epoch cursor gets one reset frame and stays subscribed", async () => {
		const { runtime, sessionId } = startRuntime(STREAMING_TURN);
		const recording = createRecordingSink();
		runtime.subscribe(
			sessionId,
			{ since: { epoch: "stale-epoch", seq: 2 }, deltas: [] },
			recording.sink,
		);

		expect(recording.envelopes).toHaveLength(1);
		expect(recording.envelopes[0]).toMatchObject({
			sessionId,
			reset: { reason: "epoch_changed" },
		});

		prompt(runtime, sessionId);
		await waitFor(() => runtime.sessions.get(sessionId)?.status === "idle");
		expect(recording.envelopes.length).toBeGreaterThan(1);
		expect(
			recording.envelopes.filter((envelope) => "reset" in envelope),
		).toHaveLength(1);
		await runtime.dispose();
	});

	test("a subscriber that declines deltas gets the spine only and converges", async () => {
		const { runtime, sessionId } = startRuntime(STREAMING_TURN);
		const withDeltas = createRecordingSink();
		const spineOnly = createRecordingSink();
		runtime.subscribe(sessionId, { deltas: ["text"] }, withDeltas.sink);
		runtime.subscribe(sessionId, { deltas: [] }, spineOnly.sink);

		prompt(runtime, sessionId);
		await waitFor(() => runtime.sessions.get(sessionId)?.status === "idle");

		expect(spineOnly.envelopes.filter(isDeltaEnvelope)).toHaveLength(0);
		expect(withDeltas.envelopes.filter(isDeltaEnvelope).length).toBeGreaterThan(
			0,
		);

		const spineSnapshot = reduceMany(emptySnapshot(), spineOnly.envelopes);
		const deltaSnapshot = reduceMany(emptySnapshot(), withDeltas.envelopes);
		expect(spineSnapshot.items).toEqual(deltaSnapshot.items);
		expect(spineSnapshot.cursor).toEqual(deltaSnapshot.cursor);
		expect(deltaSnapshot.liveStreams.size).toBe(0);
		await runtime.dispose();
	});

	test("coalesces consecutive deltas and flushes them before the next snapshot", async () => {
		const { runtime, sessionId } = startRuntime(STREAMING_TURN);
		const recording = createRecordingSink();
		runtime.subscribe(sessionId, { deltas: ["text"] }, recording.sink);

		prompt(runtime, sessionId);
		await waitFor(() => runtime.sessions.get(sessionId)?.status === "idle");

		const deltas = recording.envelopes.filter(isDeltaEnvelope);
		expect(deltas).toHaveLength(1);
		expect(deltas[0]?.delta).toMatchObject({ itemId: "a1", append: "abc" });

		const deltaIndex = recording.envelopes.findIndex(isDeltaEnvelope);
		const itemIndex = recording.envelopes.findIndex(
			(envelope) =>
				isDurableEnvelope(envelope) &&
				envelope.event.type === "item" &&
				envelope.event.item.id === "a1",
		);
		expect(deltaIndex).toBeLessThan(itemIndex);
		await runtime.dispose();
	});

	test("unsubscribe stops delivery without affecting other subscribers", async () => {
		const { runtime, sessionId } = startRuntime(STREAMING_TURN);
		const staying = createRecordingSink();
		const leaving = createRecordingSink();
		runtime.subscribe(sessionId, { deltas: [] }, staying.sink);
		const subscription = runtime.subscribe(
			sessionId,
			{ deltas: [] },
			leaving.sink,
		);
		const afterBootstrap = leaving.envelopes.length;
		subscription.unsubscribe();

		prompt(runtime, sessionId);
		await waitFor(() => runtime.sessions.get(sessionId)?.status === "idle");

		expect(leaving.envelopes).toHaveLength(afterBootstrap);
		expect(staying.envelopes.length).toBeGreaterThan(0);
		expect(runtime.subscriptions.subscriberCount(sessionId)).toBe(1);
		await runtime.dispose();
	});

	test("a subscriber with no cursor gets a bootstrap replay of the spine", async () => {
		const { runtime, sessionId } = startRuntime(STREAMING_TURN);
		prompt(runtime, sessionId);
		await waitFor(() => runtime.sessions.get(sessionId)?.status === "idle");

		const late = createRecordingSink();
		runtime.subscribe(sessionId, { deltas: ["text"] }, late.sink);

		expect(late.envelopes.filter(isDeltaEnvelope)).toHaveLength(0);
		const snapshot = reduceMany(emptySnapshot(), late.envelopes);
		expect(snapshot.session?.status).toBe("idle");
		expect(snapshot.items.get("a1")?.item).toMatchObject({ text: "abc" });
		await runtime.dispose();
	});

	describe("subagent items", () => {
		test("a client that does not opt in gets no subagent items or deltas, but gets their approvals", async () => {
			const { runtime, sessionId } = startRuntime(SUBAGENT_TURN);
			const flat = createRecordingSink();
			runtime.subscribe(
				sessionId,
				{ deltas: ["text", "background"] },
				flat.sink,
			);

			prompt(runtime, sessionId);
			await askedForApproval(runtime, sessionId);
			runtime.subscriptions.flushDeltas(sessionId);

			expect(itemIdsOf(flat.envelopes)).toEqual(FLAT_ITEM_IDS);
			expect(deltaItemIdsOf(flat.envelopes)).toEqual(["a1"]);

			const late = createRecordingSink();
			runtime.subscribe(sessionId, { deltas: [] }, late.sink);
			expect(itemIdsOf(late.envelopes)).toEqual(FLAT_ITEM_IDS);
			await runtime.dispose();
		});

		test("a client that opts in gets every subagent item and delta", async () => {
			const { runtime, sessionId } = startRuntime(SUBAGENT_TURN);
			const nested = createRecordingSink();
			runtime.subscribe(
				sessionId,
				{ deltas: ["text", "background"], nestedSubagents: true },
				nested.sink,
			);

			prompt(runtime, sessionId);
			await askedForApproval(runtime, sessionId);
			runtime.subscriptions.flushDeltas(sessionId);

			expect(itemIdsOf(nested.envelopes)).toEqual(
				expect.arrayContaining(["sub:c:u", "sub:c:a", "subagent:d", "sub:d:t"]),
			);
			expect(deltaItemIdsOf(nested.envelopes)).toEqual([
				"sub:c:a",
				"subagent:d",
				"a1",
			]);
			await runtime.dispose();
		});

		test("getItems, getOutline and getItemBodies leave subagent items out unless asked", async () => {
			const { runtime, sessionId } = startRuntime(SUBAGENT_TURN);
			prompt(runtime, sessionId);
			await askedForApproval(runtime, sessionId);

			const page = runtime.commands.getItems({ sessionId });
			const nestedPage = runtime.commands.getItems({
				sessionId,
				nestedSubagents: true,
			});
			expect(page.ok && itemIdsOf(page.envelopes)).toEqual(FLAT_ITEM_IDS);
			expect(nestedPage.ok && itemIdsOf(nestedPage.envelopes)).toContain(
				"sub:c:a",
			);

			const outline = runtime.commands.getOutline({ sessionId });
			const nestedOutline = runtime.commands.getOutline({
				sessionId,
				nestedSubagents: true,
			});
			const outlineIds = (result: typeof outline) =>
				result.ok ? result.outline.items.map((stored) => stored.item.id) : [];
			expect(outlineIds(outline)).not.toContain("sub:c:a");
			expect(outlineIds(outline)).toContain("approval:sub:d:t");
			expect(outlineIds(nestedOutline)).toContain("sub:c:a");

			const bodies = runtime.commands.getItemBodies({
				sessionId,
				itemIds: ["sub:c:a", "a1"],
			});
			expect(bodies.ok && bodies.items.map((stored) => stored.item.id)).toEqual(
				["a1"],
			);
			await runtime.dispose();
		});
	});
});
