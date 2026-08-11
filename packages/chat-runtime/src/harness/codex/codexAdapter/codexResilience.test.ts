import { describe, expect, test } from "bun:test";
import type { Notice } from "@superset/chat/protocol";
import type { AdapterEvent } from "../../types";
import { FixturePlayer } from "../fixturePlayer";
import { fixtureCwd, loadCodexFixture } from "../fixtures";
import type { CodexTransportHandlers } from "../rpcClient";
import { CodexAdapter } from "./codexAdapter";

const THREAD_ID = "thread-1";
const TURN_ID = "turn-1";

type Harness = {
	adapter: CodexAdapter;
	events: AdapterEvent[];
	sent: Record<string, unknown>[];
	receive(frame: unknown): void;
	settle(): Promise<void>;
};

function startAdapter(): Harness {
	const sent: Record<string, unknown>[] = [];
	const events: AdapterEvent[] = [];
	let handlers: CodexTransportHandlers | null = null;

	const adapter = new CodexAdapter({
		now: () => 1_785_000_000_000,
		mintId: () => "minted",
		createTransport: (_options, transportHandlers) => {
			handlers = transportHandlers;
			return {
				send: (line) => {
					const frame = JSON.parse(line) as {
						id?: number;
						method?: string;
					};
					sent.push(frame);
					if (frame.method === "initialize") {
						handlers?.onLine(
							JSON.stringify({
								id: frame.id,
								result: {
									userAgent: "superset-chat-runtime/0.143.0 (Mac OS)",
								},
							}),
						);
						return;
					}
					if (frame.method === "thread/start") {
						handlers?.onLine(
							JSON.stringify({
								id: frame.id,
								result: { thread: { id: THREAD_ID }, model: "gpt-5.5" },
							}),
						);
					}
				},
				close: async () => undefined,
			};
		},
	});

	void (async () => {
		for await (const event of adapter.start({ cwd: "/tmp/workspace" })) {
			events.push(event);
		}
	})();

	return {
		adapter,
		events,
		sent,
		receive: (frame) => handlers?.onLine(JSON.stringify(frame)),
		settle: async () => {
			for (let index = 0; index < 6; index += 1) {
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		},
	};
}

function notices(events: AdapterEvent[]): Notice[] {
	return events.flatMap((event) =>
		event.kind === "item" && event.item.kind === "notice"
			? [event.item as Notice]
			: [],
	);
}

describe("codex adapter resilience", () => {
	test("an unreadable notification becomes a notice, not a thrown frame", async () => {
		const harness = startAdapter();
		await harness.settle();

		expect(() =>
			harness.receive({
				method: "item/started",
				params: { item: { type: "agentMessage" }, threadId: THREAD_ID },
			}),
		).not.toThrow();
		await harness.settle();

		expect(notices(harness.events).at(-1)).toMatchObject({
			noticeKind: "error",
		});
		expect(
			notices(harness.events).at(-1)?.text?.startsWith("codex item/started"),
		).toBe(true);

		await harness.adapter.dispose();
	});

	test("an unreadable server request is answered so codex is not left waiting", async () => {
		const harness = startAdapter();
		await harness.settle();

		harness.receive({
			id: "srv-1",
			method: "item/commandExecution/requestApproval",
			params: { threadId: THREAD_ID },
		});
		await harness.settle();

		const response = harness.sent.find((frame) => frame.id === "srv-1");
		expect(response).toMatchObject({ error: { code: -32601 } });
		expect(notices(harness.events).at(-1)?.noticeKind).toBe("error");

		await harness.adapter.dispose();
	});

	test("a stream that keeps arriving after a bad frame still maps items", async () => {
		const harness = startAdapter();
		await harness.settle();

		harness.receive({ method: "item/started", params: { nonsense: true } });
		harness.receive({
			method: "item/completed",
			params: {
				item: { type: "agentMessage", id: "msg-1", text: "hello" },
				threadId: THREAD_ID,
				turnId: TURN_ID,
				completedAtMs: 5,
			},
		});
		await harness.settle();

		const messages = harness.events.flatMap((event) =>
			event.kind === "item" && event.item.kind === "agent_message"
				? [event.item]
				: [],
		);
		expect(messages.at(-1)).toMatchObject({ id: "msg-1", text: "hello" });

		await harness.adapter.dispose();
	});
});

describe("codex cancel before the turn is running", () => {
	test("a cancel raced against turn/start is applied when the turn appears", async () => {
		const harness = startAdapter();
		await harness.settle();

		harness.adapter.prompt([{ type: "text", text: "go" }]);
		await harness.settle();
		expect(harness.sent.some((frame) => frame.method === "turn/start")).toBe(
			true,
		);

		harness.adapter.cancelTurn();
		expect(
			harness.sent.some((frame) => frame.method === "turn/interrupt"),
		).toBe(false);

		harness.receive({
			method: "turn/started",
			params: {
				threadId: THREAD_ID,
				turn: { id: TURN_ID, status: "inProgress", startedAt: 1 },
			},
		});

		const interrupt = harness.sent.find(
			(frame) => frame.method === "turn/interrupt",
		);
		expect(interrupt).toMatchObject({
			params: { threadId: THREAD_ID, turnId: TURN_ID },
		});

		await harness.adapter.dispose();
	});

	test("a cancel with no turn in flight is not held against the next turn", async () => {
		const harness = startAdapter();
		await harness.settle();

		harness.adapter.cancelTurn();
		harness.adapter.prompt([{ type: "text", text: "go" }]);
		await harness.settle();

		harness.receive({
			method: "turn/started",
			params: {
				threadId: THREAD_ID,
				turn: { id: TURN_ID, status: "inProgress", startedAt: 1 },
			},
		});

		expect(
			harness.sent.some((frame) => frame.method === "turn/interrupt"),
		).toBe(false);

		await harness.adapter.dispose();
	});

	test("a cancel after the turn already settled is dropped", async () => {
		const harness = startAdapter();
		await harness.settle();

		harness.adapter.prompt([{ type: "text", text: "go" }]);
		await harness.settle();
		harness.receive({
			method: "turn/completed",
			params: {
				threadId: THREAD_ID,
				turn: {
					id: TURN_ID,
					status: "completed",
					startedAt: 1,
					completedAt: 2,
				},
			},
		});

		harness.adapter.cancelTurn();
		expect(
			harness.sent.some((frame) => frame.method === "turn/interrupt"),
		).toBe(false);

		await harness.adapter.dispose();
	});
});

describe("codex fixtures still map after the guards", () => {
	test("the command fixture is unchanged by the dispatch wrapper", async () => {
		const frames = loadCodexFixture("command");
		const player = new FixturePlayer(frames);
		const adapter = new CodexAdapter({
			createTransport: (_options, handlers) => player.transport(handlers),
		});
		const events: AdapterEvent[] = [];
		const pump = (async () => {
			for await (const event of adapter.start({ cwd: fixtureCwd(frames) })) {
				events.push(event);
			}
		})();
		adapter.prompt([{ type: "text", text: "fixture prompt" }]);

		const deadline = Date.now() + 5000;
		while (!player.exhausted) {
			if (Date.now() > deadline) throw new Error("fixture stalled");
			await new Promise((resolve) => setTimeout(resolve, 1));
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
		await adapter.dispose();
		await pump;

		expect(notices(events)).toEqual([]);
		const calls = events.flatMap((event) =>
			event.kind === "item" && event.item.kind === "tool_call"
				? [event.item]
				: [],
		);
		expect(calls.at(-1)).toMatchObject({ status: "completed" });
	});
});
