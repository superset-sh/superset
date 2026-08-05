import { describe, expect, test } from "bun:test";
import { emptySnapshot, reduceMany } from "@superset/chat/core";
import type {
	DurableEnvelope,
	Item,
	SessionState,
} from "@superset/chat/protocol";
import { createTestRuntime } from "../../../testing/testRuntime";
import type { AdapterEvent } from "../../types";
import { type ClaudeFixture, loadFixture } from "../fixtures";
import { ClaudeTranslator } from "./translateStream";

const CWD = "/tmp/workspace";

function translateFixture(name: ClaudeFixture): AdapterEvent[] {
	let counter = 0;
	const translator = new ClaudeTranslator({
		cwd: CWD,
		now: () => 1,
		mintId: () => {
			counter += 1;
			return `id-${counter}`;
		},
	});
	return loadFixture(name).flatMap((message) => translator.translate(message));
}

function items(events: AdapterEvent[]): Item[] {
	return events.flatMap((event) => (event.kind === "item" ? [event.item] : []));
}

function itemsOfKind(events: AdapterEvent[], kind: string): Item[] {
	return items(events).filter((item) => item.kind === kind);
}

function toolCalls(events: AdapterEvent[], name: string): Item[] {
	return itemsOfKind(events, "tool_call").filter(
		(item) => (item as { toolName: string }).toolName === name,
	);
}

describe("ClaudeTranslator", () => {
	test("text reply yields one running turn, reasoning, agent message, completion", () => {
		const events = translateFixture("text-reply");
		const turns = events.flatMap((event) =>
			event.kind === "turn" ? [event.turn] : [],
		);

		expect(turns[0]?.status).toBe("running");
		expect(turns.at(-1)?.status).toBe("completed");
		expect(turns.at(-1)?.usage?.outputTokens).toBeGreaterThan(0);
		expect(new Set(turns.map((turn) => turn.id)).size).toBe(1);

		expect(itemsOfKind(events, "agent_message").at(-1)).toMatchObject({
			text: "hello",
		});
		expect(itemsOfKind(events, "reasoning").length).toBeGreaterThan(0);
		expect(events.some((event) => event.kind === "session")).toBe(true);
	});

	test("streams text deltas that target the item the snapshot later replaces", () => {
		const events = translateFixture("text-reply");
		const deltas = events.flatMap((event) =>
			event.kind === "delta" ? [event.delta] : [],
		);
		const messageIds = new Set(
			itemsOfKind(events, "agent_message").map((item) => item.id),
		);

		expect(deltas.length).toBeGreaterThan(0);
		expect(deltas.some((delta) => messageIds.has(delta.itemId))).toBe(true);
	});

	test("bash run maps to an execute tool call with terminal content", () => {
		const events = translateFixture("bash-run");
		const calls = toolCalls(events, "Bash");
		const settled = calls.at(-1) as {
			toolKind: string;
			status: string;
			title: string;
			content: { type: string; command?: string; output?: string }[];
			rawOutput: unknown;
		};

		expect(calls[0]).toMatchObject({ status: "running", toolKind: "execute" });
		expect(settled.status).toBe("completed");
		expect(settled.content[0]?.type).toBe("terminal");
		expect(settled.content[0]?.output).toContain("hi");
		expect(settled.rawOutput).toMatchObject({ stdout: expect.any(String) });
	});

	test("approved edit produces a diff whose oldText is the original file", () => {
		const events = translateFixture("edit-approved");
		const settled = toolCalls(events, "Edit").at(-1) as {
			status: string;
			toolKind: string;
			content: {
				type: string;
				path: string;
				oldText: string;
				newText: string;
			}[];
		};

		expect(settled.status).toBe("completed");
		expect(settled.toolKind).toBe("edit");
		expect(settled.content[0]?.type).toBe("diff");
		expect(settled.content[0]?.oldText).toContain("foo");
		expect(settled.content[0]?.newText).toContain("bar");
	});

	test("declined edit settles as failed and the turn still completes", () => {
		const events = translateFixture("edit-declined");
		const settled = toolCalls(events, "Edit").at(-1) as { status: string };
		const turns = events.flatMap((event) =>
			event.kind === "turn" ? [event.turn] : [],
		);

		expect(settled.status).toBe("failed");
		expect(turns.at(-1)?.status).toBe("completed");
	});

	test("declined tool calls marked by the adapter settle as declined", () => {
		let counter = 0;
		const translator = new ClaudeTranslator({
			cwd: CWD,
			now: () => 1,
			mintId: () => {
				counter += 1;
				return `id-${counter}`;
			},
		});
		const messages = loadFixture("edit-declined");
		const events: AdapterEvent[] = [];
		for (const message of messages) {
			const use = (message as { message?: { content?: unknown[] } }).message
				?.content?.[0] as { type?: string; name?: string; id?: string };
			if (use?.type === "tool_use" && use.name === "Edit" && use.id) {
				events.push(...translator.translate(message));
				translator.markDeclined(use.id);
				continue;
			}
			events.push(...translator.translate(message));
		}

		expect(toolCalls(events, "Edit").at(-1)).toMatchObject({
			status: "declined",
		});
	});

	test("subagent output carries parentItemId provenance", () => {
		const events = translateFixture("subagent-task");
		const nested = items(events).filter((item) => item.parentItemId);

		expect(nested.length).toBeGreaterThan(0);
		expect(toolCalls(events, "Agent").length).toBeGreaterThan(0);
	});

	test("interrupt cancels running tool calls and interrupts the turn", () => {
		let counter = 0;
		const translator = new ClaudeTranslator({
			cwd: CWD,
			now: () => 1,
			mintId: () => {
				counter += 1;
				return `id-${counter}`;
			},
		});
		const events = loadFixture("abort-mid-tool").flatMap((message) =>
			translator.translate(message),
		);
		const interrupted = translator.interrupt("aborted by user");

		const canceled = itemsOfKind(interrupted, "tool_call");
		expect(canceled.length).toBeGreaterThan(0);
		expect(canceled.every((item) => item.status === "canceled")).toBe(true);
		expect(canceled.some((item) => item.toolName === "Bash")).toBe(true);
		expect(interrupted.at(-1)).toMatchObject({
			kind: "turn",
			turn: { status: "interrupted" },
		});

		const runningBeforeAbort = itemsOfKind(events, "tool_call");
		expect(runningBeforeAbort.length).toBeGreaterThan(0);
		expect(runningBeforeAbort.every((item) => item.status === "running")).toBe(
			true,
		);
	});

	test("every fixture folds through the journal into a stable snapshot", async () => {
		const runtime = createTestRuntime();
		const sessionId = "claude-session";
		runtime.journal.open({
			sessionId,
			scopeId: "workspace-1",
			harness: "claude-code",
		});

		const events = translateFixture("edit-approved");
		const live: DurableEnvelope[] = [];
		let session: SessionState = { status: "starting", harness: "claude-code" };

		for (const event of events) {
			if (event.kind === "delta") continue;
			if (event.kind === "session") {
				session = { ...session, ...event.session };
				live.push(
					runtime.journal.appendEnvelope(sessionId, {
						type: "session",
						session,
					}),
				);
				continue;
			}
			if (event.kind === "turn") {
				live.push(
					runtime.journal.appendEnvelope(sessionId, {
						type: "turn",
						turn: event.turn,
					}),
				);
				continue;
			}
			live.push(
				runtime.journal.appendEnvelope(sessionId, {
					type: "item",
					item: event.item,
					turnId: event.turnId,
				}),
			);
		}

		const snapshot = reduceMany(emptySnapshot(), live);
		expect(snapshot.session?.harness).toBe("claude-code");
		expect(snapshot.turns.size).toBe(1);
		expect([...snapshot.turns.values()][0]?.status).toBe("completed");
		expect(snapshot.items.size).toBeGreaterThan(3);
		expect(
			[...snapshot.items.values()].every((stored) => stored.turnId.length > 0),
		).toBe(true);
		await runtime.dispose();
	});

	test("tool input deltas target the tool call id, not the message block id", () => {
		const events = translateFixture("bash-run");
		const toolIds = new Set(itemsOfKind(events, "tool_call").map((i) => i.id));
		const inputDeltas = events.flatMap((event) =>
			event.kind === "delta" && event.delta.type === "tool_input"
				? [event.delta]
				: [],
		);

		expect(inputDeltas.length).toBeGreaterThan(0);
		expect(inputDeltas.every((delta) => toolIds.has(delta.itemId))).toBe(true);
		expect(
			inputDeltas.every((delta) => delta.itemId.startsWith("toolu_")),
		).toBe(true);
	});

	test("subagent cards never render the harness's internal metadata", () => {
		const events = translateFixture("subagent-task");
		const rendered = itemsOfKind(events, "tool_call")
			.filter((item) => item.toolName === "Agent")
			.flatMap((item) => item.content)
			.map((part) => JSON.stringify(part))
			.join(" ");

		expect(rendered).not.toContain("agentId");
		expect(rendered).not.toContain("internal metadata");
		expect(rendered).not.toContain("outputFile");
	});

	test("keeps read-cache and creation-cache token counts distinct", () => {
		const events = translateFixture("text-reply");
		const usage = events.flatMap((event) =>
			event.kind === "turn" && event.turn.usage ? [event.turn.usage] : [],
		);
		const raw = loadFixture("text-reply").flatMap((message) => {
			const envelope = message as {
				type?: string;
				usage?: Record<string, number>;
			};
			return envelope.type === "result" && envelope.usage
				? [envelope.usage]
				: [];
		});

		expect(usage.at(-1)?.cachedInputTokens).toBe(
			raw.at(-1)?.cache_read_input_tokens ?? 0,
		);
		expect(usage.at(-1)?.inputTokens).toBe(
			(raw.at(-1)?.input_tokens ?? 0) +
				(raw.at(-1)?.cache_creation_input_tokens ?? 0),
		);
	});

	test("subagent task telemetry does not become notice items", () => {
		const events = translateFixture("subagent-task");
		const notices = itemsOfKind(events, "notice").map((item) =>
			JSON.stringify(item),
		);

		expect(notices.some((notice) => notice.includes("task_started"))).toBe(
			false,
		);
		expect(notices.some((notice) => notice.includes("task_updated"))).toBe(
			false,
		);
		expect(notices.some((notice) => notice.includes("task_notification"))).toBe(
			false,
		);
	});

	test("a zero-cost turn still reports costUsd", () => {
		let counter = 0;
		const translator = new ClaudeTranslator({
			cwd: CWD,
			now: () => 1,
			mintId: () => {
				counter += 1;
				return `id-${counter}`;
			},
		});
		translator.translate({
			type: "stream_event",
			event: { type: "message_start", message: { id: "msg_1" } },
		});
		const events = translator.translate({
			type: "result",
			subtype: "success",
			is_error: false,
			total_cost_usd: 0,
			usage: { input_tokens: 1, output_tokens: 1 },
		});

		expect(events.at(-1)).toMatchObject({
			kind: "turn",
			turn: { usage: { costUsd: 0 } },
		});
	});
});
