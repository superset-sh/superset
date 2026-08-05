import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { deriveTimeline, emptySnapshot, reduceMany } from "@superset/chat/core";
import type { Item, Turn } from "@superset/chat/protocol";
import type { HarnessRegistry } from "../../../sessions";
import { createTestRuntime } from "../../../testing/testRuntime";
import { journalEnvelopes, waitFor } from "../../../testing/testUtils";
import { FixturePlayer } from "../fixturePlayer";
import type { CodexFixtureName } from "../fixtures";
import { fixtureCwd, loadCodexFixture } from "../fixtures";
import { CodexAdapter } from "./codexAdapter";

const CODEX_HARNESS = "codex";

function codexFixtureRegistry(name: CodexFixtureName): {
	harnesses: HarnessRegistry;
	player: FixturePlayer;
	cwd: string;
	adapters: CodexAdapter[];
} {
	const frames = loadCodexFixture(name);
	const player = new FixturePlayer(frames);
	const adapters: CodexAdapter[] = [];
	const harnesses: HarnessRegistry = new Map([
		[
			CODEX_HARNESS,
			() => {
				const adapter = new CodexAdapter({
					createTransport: (_options, handlers) => player.transport(handlers),
				});
				adapters.push(adapter);
				return adapter;
			},
		],
	]);
	return { harnesses, player, cwd: fixtureCwd(frames), adapters };
}

async function foldFixture(
	name: CodexFixtureName,
	onItem?: (item: Item, adapters: CodexAdapter[]) => void,
): Promise<{ items: Item[]; turns: Turn[] }> {
	const { harnesses, player, cwd, adapters } = codexFixtureRegistry(name);
	const runtime = createTestRuntime({ harnesses });
	const created = runtime.commands.createSession({
		commandId: randomUUID(),
		scopeId: "workspace-1",
		harness: CODEX_HARNESS,
		cwd,
	});

	runtime.commands.prompt({
		commandId: randomUUID(),
		sessionId: created.sessionId,
		clientId: "client-1",
		content: [{ type: "text", text: "fixture prompt" }],
	});

	if (onItem) {
		const seen = new Set<string>();
		const poll = setInterval(() => {
			for (const envelope of journalEnvelopes(runtime, created.sessionId)) {
				if (envelope.event.type !== "item") continue;
				const item = envelope.event.item;
				const key = `${item.id}:${JSON.stringify(item)}`;
				if (seen.has(key)) continue;
				seen.add(key);
				onItem(item, adapters);
			}
		}, 1);
		try {
			await waitFor(() => player.exhausted, 8000);
		} finally {
			clearInterval(poll);
		}
	} else {
		await waitFor(() => player.exhausted, 8000);
	}

	await new Promise((resolve) => setTimeout(resolve, 25));
	const envelopes = journalEnvelopes(runtime, created.sessionId);
	const snapshot = reduceMany(emptySnapshot(), envelopes);
	const groups = deriveTimeline(snapshot);
	await runtime.dispose();

	return {
		items: groups.flatMap((group) =>
			group.entries.flatMap((entry) =>
				entry.kind === "item" ? [entry.item] : entry.items,
			),
		),
		turns: [...snapshot.turns.values()],
	};
}

describe("codexAdapter through the journal", () => {
	test("a command turn folds into user message, tool call and reply", async () => {
		const { items, turns } = await foldFixture("command");

		expect(
			items.filter((item) => item.kind !== "user_message").map((i) => i.kind),
		).toEqual(["tool_call", "agent_message"]);
		expect(items.find((item) => item.kind === "user_message")).toMatchObject({
			clientId: "client-1",
			content: [{ type: "text", text: "fixture prompt" }],
		});
		expect(items.find((item) => item.kind === "tool_call")).toMatchObject({
			status: "completed",
			title: "echo superset-probe",
		});
		expect(items.find((item) => item.kind === "agent_message")).toMatchObject({
			text: "superset-probe",
		});
		expect(turns.map((turn) => turn.status)).toEqual(["completed"]);
	});

	test("an interrupted turn leaves no item running", async () => {
		const { items, turns } = await foldFixture(
			"interrupt",
			(item, adapters) => {
				if (item.kind !== "agent_message") return;
				for (const adapter of adapters) adapter.cancelTurn();
			},
		);

		expect(turns.map((turn) => turn.status)).toEqual(["interrupted"]);
		for (const item of items) {
			if (item.kind !== "tool_call") continue;
			expect(item.status).not.toBe("running");
		}
	});

	test("an approval folds into an answered row bound to its tool call", async () => {
		const { items } = await foldFixture("approval", (item, adapters) => {
			if (item.kind !== "approval_request" || item.status !== "pending") return;
			for (const adapter of adapters) {
				adapter.respondToApproval(item.id, { type: "accept" });
			}
		});

		const approval = items.find((item) => item.kind === "approval_request");
		expect(approval).toMatchObject({
			kind: "approval_request",
			status: "answered",
			decision: { type: "accept" },
			targetItemId: "call_LThMNKSLHftjsTeRtUIyAyTa",
		});
		expect(
			items.some(
				(item) =>
					item.kind === "tool_call" &&
					item.id === "call_LThMNKSLHftjsTeRtUIyAyTa",
			),
		).toBe(true);
	});
});
