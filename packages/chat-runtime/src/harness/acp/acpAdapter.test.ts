import { describe, expect, it } from "bun:test";
import type { Item } from "@superset/chat/protocol";
import { AGENT_DEFAULT_MODE } from "@superset/chat/protocol";
import type { AdapterEvent } from "../types";
import { AcpAdapter, type AcpAdapterOptions } from "./acpAdapter";
import { AIR_CLIENT_META } from "./air";
import type { AcpTransport, AcpTransportHandlers } from "./rpcClient";

/**
 * A scripted ACP agent: auto-responds to initialize/session_new, and for
 * session/prompt delivers a canned stream of session/update notifications
 * before returning the stop reason. Captures client->agent frames for
 * assertions.
 */
class FakeAcpAgent {
	readonly sent: Array<Record<string, unknown>> = [];
	/** Answer session/load with "Resource not found", as a never-prompted
	 * session does. */
	loadFails = false;
	/** What the agent answers `initialize` with; older agents answer 1. */
	protocolVersion = 2;
	/** Session capabilities advertised at initialize; both shipped agents fork. */
	sessionCapabilities: Record<string, unknown> | null = { fork: {} };
	/** Replay history with v2's whole-message variants instead of chunks. */
	wholeMessageReplay = false;
	foreignUpdateDuringLoad: Record<string, unknown> | null = null;
	newSessionConfigOptions: Array<Record<string, unknown>> | null = null;
	/** v1's session/new `modes` block; v2 agents report the mode as a config option. */
	newSessionModes: Record<string, unknown> | null = null;
	/** Reported while a session loads, as an agent restoring its saved options does. */
	loadConfigOptions: Array<Record<string, unknown>> | null = null;
	/** Hold mode and option answers until `releaseSelections`. */
	holdSelections = false;
	rejectSelections = false;
	private heldSelections: number[] = [];
	/** Advertise `_session/steering` and answer it with this outcome. */
	steeringOutcome: string | null = null;
	/** Leave session/prompt unanswered, as a turn still running does. */
	holdPrompts = false;
	private handlers!: AcpTransportHandlers;

	transport(handlers: AcpTransportHandlers): AcpTransport {
		this.handlers = handlers;
		return {
			send: (line) => this.onSend(line),
			close: async () => undefined,
		};
	}

	private deliver(frame: Record<string, unknown>): void {
		this.handlers.onLine(JSON.stringify(frame));
	}

	private respond(id: number, result: unknown): void {
		this.deliver({ jsonrpc: "2.0", id, result });
	}

	exit(code: number): void {
		this.handlers.onExit(code, null);
	}

	notify(sessionId: string, update: Record<string, unknown>): void {
		this.deliver({
			jsonrpc: "2.0",
			method: "session/update",
			params: { sessionId, update },
		});
	}

	/** Ask the agent to request a permission mid-turn; returns the request id. */
	requestPermission(sessionId: string, toolCallId: string): number {
		const id = 9001;
		this.deliver({
			jsonrpc: "2.0",
			id,
			method: "session/request_permission",
			params: {
				sessionId,
				toolCall: { toolCallId, title: "Run tests" },
				options: [
					{ optionId: "allow", name: "Allow", kind: "allow_once" },
					{ optionId: "reject", name: "Reject", kind: "reject_once" },
				],
			},
		});
		return id;
	}

	releaseSelections(): void {
		for (const id of this.heldSelections.splice(0)) this.respond(id, null);
	}

	lastPermissionResponse(): Record<string, unknown> | undefined {
		return this.sent.find((f) => f.id === 9001);
	}

	private onSend(line: string): void {
		const frame = JSON.parse(line) as {
			id?: number;
			method?: string;
			params?: Record<string, unknown>;
		};
		this.sent.push(frame as Record<string, unknown>);
		if (frame.id === undefined || frame.method === undefined) return;

		queueMicrotask(() => {
			if (frame.method === "initialize") {
				this.respond(frame.id as number, {
					...(this.steeringOutcome
						? { _meta: { steering: { supported: true } } }
						: {}),
					protocolVersion: this.protocolVersion,
					capabilities: {
						promptCapabilities: { image: true },
						...(this.sessionCapabilities
							? { sessionCapabilities: this.sessionCapabilities }
							: {}),
					},
				});
			} else if (frame.method === "session/new") {
				this.respond(frame.id as number, {
					sessionId: "sess-1",
					...(this.newSessionConfigOptions
						? { configOptions: this.newSessionConfigOptions }
						: {}),
					...(this.newSessionModes ? { modes: this.newSessionModes } : {}),
				});
			} else if (
				frame.method === "session/set_config_option" ||
				frame.method === "session/set_mode"
			) {
				if (this.rejectSelections) {
					this.deliver({
						jsonrpc: "2.0",
						id: frame.id,
						error: { code: -32602, message: "mode not allowed" },
					});
				} else if (this.holdSelections) {
					this.heldSelections.push(frame.id as number);
				} else {
					this.respond(frame.id as number, null);
				}
			} else if (frame.method === "session/fork") {
				this.respond(frame.id as number, { sessionId: "sess-forked" });
			} else if (frame.method === "session/load" && this.loadFails) {
				this.deliver({
					jsonrpc: "2.0",
					id: frame.id,
					error: { code: -32002, message: "Resource not found: sess-1" },
				});
			} else if (frame.method === "session/load" && this.wholeMessageReplay) {
				const sessionId = (frame.params as { sessionId: string }).sessionId;
				this.notify(sessionId, {
					sessionUpdate: "user_message",
					messageId: "u1",
					content: [{ type: "text", text: "fix the flaky test" }],
				});
				this.notify(sessionId, {
					sessionUpdate: "agent_message",
					messageId: "a1",
					content: [{ type: "text", text: "On it." }],
				});
				this.respond(frame.id as number, null);
			} else if (frame.method === "session/load" && this.loadConfigOptions) {
				const sessionId = (frame.params as { sessionId: string }).sessionId;
				this.notify(sessionId, {
					sessionUpdate: "config_option_update",
					configOptions: this.loadConfigOptions,
				});
				this.respond(frame.id as number, null);
			} else if (frame.method === "session/load") {
				// A real agent replays the whole transcript — the user's turns
				// included — before it answers.
				const sessionId = (frame.params as { sessionId: string }).sessionId;
				this.notify(sessionId, {
					sessionUpdate: "user_message_chunk",
					content: { type: "text", text: "fix the flaky test" },
				});
				this.notify(sessionId, {
					sessionUpdate: "agent_message_chunk",
					content: { type: "text", text: "On it." },
				});
				this.notify(sessionId, {
					sessionUpdate: "user_message_chunk",
					content: { type: "text", text: "now ship it" },
				});
				this.notify(sessionId, {
					sessionUpdate: "agent_message_chunk",
					content: { type: "text", text: "Shipped." },
				});
				if (this.foreignUpdateDuringLoad) {
					this.notify("other-session", this.foreignUpdateDuringLoad);
				}
				// ACP returns null after replaying history; adapter keeps the id.
				this.respond(frame.id as number, null);
			} else if (frame.method === "_session/steering") {
				this.respond(frame.id as number, { outcome: this.steeringOutcome });
			} else if (frame.method === "session/prompt" && this.holdPrompts) {
				return;
			} else if (frame.method === "session/prompt") {
				this.notify("sess-1", {
					sessionUpdate: "agent_message_chunk",
					content: { type: "text", text: "Hello" },
				});
				this.notify("sess-1", {
					sessionUpdate: "agent_message_chunk",
					content: { type: "text", text: " world" },
				});
				this.notify("sess-1", {
					sessionUpdate: "tool_call",
					toolCallId: "tc-1",
					title: "Read file",
					kind: "read",
					status: "completed",
					content: [{ type: "content", content: { type: "text", text: "ok" } }],
				});
				this.respond(frame.id as number, { stopReason: "end_turn" });
			}
		});
	}
}

async function collect(
	iterable: AsyncIterable<AdapterEvent>,
	into: AdapterEvent[],
) {
	for await (const event of iterable) into.push(event);
}

async function flush(times = 8): Promise<void> {
	for (let i = 0; i < times; i++) await Promise.resolve();
}

function startAdapter(
	agent: FakeAcpAgent,
	resume?: string,
	selections: { modelId?: string; modeId?: string } = {},
	adapterOptions: Pick<
		AcpAdapterOptions,
		"defaultModeId" | "selectionWaitMs" | "backgroundDetailIntervalMs"
	> = {},
): { adapter: AcpAdapter; events: AdapterEvent[] } {
	let counter = 0;
	const adapter = new AcpAdapter({
		command: "fake",
		createTransport: (_opts, handlers) => agent.transport(handlers),
		now: () => 1,
		mintId: () => `id-${++counter}`,
		...adapterOptions,
	});
	const events: AdapterEvent[] = [];
	void collect(
		adapter.start({
			cwd: "/work",
			...(resume ? { resume: { harnessSessionId: resume } } : {}),
			...selections,
		}),
		events,
	);
	return { adapter, events };
}

function itemsOf(events: AdapterEvent[]) {
	return events
		.filter((e) => e.kind === "item")
		.map((e) => (e.kind === "item" ? e.item : null))
		.filter((item) => item !== null);
}

function sessionsOf(events: AdapterEvent[]) {
	return events
		.filter((e) => e.kind === "session")
		.map((e) => (e.kind === "session" ? e.session : null))
		.filter((session) => session !== null);
}

function textOf(item: Item | undefined): string {
	return item && "text" in item && typeof item.text === "string"
		? item.text
		: "";
}

describe("AcpAdapter", () => {
	it("bootstraps, streams a turn, and maps items", async () => {
		const agent = new FakeAcpAgent();
		let counter = 0;
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			now: () => 1000,
			mintId: () => `id-${++counter}`,
		});

		const events: AdapterEvent[] = [];
		void collect(adapter.start({ cwd: "/work" }), events);
		await flush();

		adapter.prompt([{ type: "text", text: "hi" }]);
		await flush();

		const sessions = events.filter((e) => e.kind === "session");
		expect(
			sessions.map((e) => (e.kind === "session" ? e.session.status : null)),
		).toContain("idle");

		const items = events
			.filter((e) => e.kind === "item")
			.map((e) => (e.kind === "item" ? e.item : null));
		// The item is re-emitted with full text when the text stream flushes.
		const agentMessages = items.filter((i) => i?.kind === "agent_message");
		const agentMessage = agentMessages[agentMessages.length - 1];
		expect(
			agentMessage && "text" in agentMessage ? agentMessage.text : "",
		).toBe("Hello world");

		const toolCall = items.find((i) => i?.kind === "tool_call");
		expect(toolCall && "toolKind" in toolCall ? toolCall.toolKind : "").toBe(
			"read",
		);

		const textDeltas = events.filter((e) => e.kind === "delta");
		expect(textDeltas.length).toBe(2);

		const turns = events
			.filter((e) => e.kind === "turn")
			.map((e) => (e.kind === "turn" ? e.turn.status : null));
		expect(turns).toContain("running");
		expect(turns).toContain("completed");

		// initialize + session/new + session/prompt all went out.
		expect(agent.sent.map((f) => f.method)).toEqual([
			"initialize",
			"session/new",
			"session/prompt",
		]);

		await adapter.dispose();
	});

	it("steers a prompt into the running turn when the agent advertises it", async () => {
		const agent = new FakeAcpAgent();
		agent.steeringOutcome = "injected";
		agent.holdPrompts = true;
		const { adapter } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "first" }]);
		await flush();

		expect(adapter.canSteer()).toBe(true);
		expect(await adapter.steer([{ type: "text", text: "and this" }])).toBe(
			true,
		);
		expect(agent.sent.at(-1)).toMatchObject({
			method: "_session/steering",
			params: {
				sessionId: "sess-1",
				prompt: [{ type: "text", text: "and this" }],
				_meta: { steering: { idleBehavior: "promptRequired" } },
			},
		});
		await adapter.dispose();
	});

	it("does not steer an agent that does not advertise it", async () => {
		const agent = new FakeAcpAgent();
		agent.holdPrompts = true;
		const { adapter } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "first" }]);
		await flush();

		expect(adapter.canSteer()).toBe(false);
		expect(await adapter.steer([{ type: "text", text: "and this" }])).toBe(
			false,
		);
		expect(agent.sent.map((f) => f.method)).not.toContain("_session/steering");
		await adapter.dispose();
	});

	it("reports a steer the agent hands back as not taken", async () => {
		const agent = new FakeAcpAgent();
		agent.steeringOutcome = "promptRequired";
		agent.holdPrompts = true;
		const { adapter } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "first" }]);
		await flush();

		expect(await adapter.steer([{ type: "text", text: "and this" }])).toBe(
			false,
		);
		await adapter.dispose();
	});

	it("never emits an item with an empty turnId (history replay before any turn)", async () => {
		const agent = new FakeAcpAgent();
		let counter = 0;
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			now: () => 1,
			mintId: () => `id-${++counter}`,
		});
		const events: AdapterEvent[] = [];
		void collect(adapter.start({ cwd: "/work" }), events);
		await flush();

		// Simulate the agent replaying a message with no prompt turn in flight.
		(
			agent as unknown as { deliver: (f: Record<string, unknown>) => void }
		).deliver({
			jsonrpc: "2.0",
			method: "session/update",
			params: {
				sessionId: "sess-1",
				update: {
					sessionUpdate: "agent_message_chunk",
					content: { type: "text", text: "old reply" },
				},
			},
		});
		await flush();

		const itemTurnIds = events
			.filter((e) => e.kind === "item")
			.map((e) => (e.kind === "item" ? e.turnId : ""));
		expect(itemTurnIds.length).toBeGreaterThan(0);
		expect(itemTurnIds.every((id) => id.length > 0)).toBe(true);

		await adapter.dispose();
	});

	it("resumes an existing agent session via session/load", async () => {
		const agent = new FakeAcpAgent();
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			now: () => 1,
			mintId: () => "x",
		});
		const events: AdapterEvent[] = [];
		void collect(
			adapter.start({ cwd: "/work", resume: { harnessSessionId: "sess-1" } }),
			events,
		);
		await flush();

		expect(agent.sent.map((f) => f.method)).toContain("session/load");
		await adapter.dispose();
	});

	it("keeps another session's updates out of a replay", async () => {
		const agent = new FakeAcpAgent();
		agent.foreignUpdateDuringLoad = {
			sessionUpdate: "tool_call",
			toolCallId: "stray-1",
			title: "ls",
			kind: "execute",
			status: "pending",
		};
		const { adapter, events } = startAdapter(agent, "sess-1");
		await flush();

		expect(
			itemsOf(events).some((i) => i.kind === "tool_call" && i.id === "stray-1"),
		).toBe(false);
		await adapter.dispose();
	});

	it("records the replayed transcript, user turns included", async () => {
		const agent = new FakeAcpAgent();
		let counter = 0;
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			now: () => 1,
			mintId: () => `id-${++counter}`,
		});
		const events: AdapterEvent[] = [];
		void collect(
			adapter.start({ cwd: "/work", resume: { harnessSessionId: "sess-1" } }),
			events,
		);
		await flush(40);

		const items = events
			.filter((e) => e.kind === "item")
			.map((e) => (e.kind === "item" ? e.item : null));

		// The first one is the report: it used to be dropped entirely.
		const userMessage = items.find((i) => i?.kind === "user_message");
		expect(
			userMessage && "content" in userMessage ? userMessage.content : [],
		).toEqual([{ type: "text", text: "fix the flaky test" }]);

		// Complete without a later turn to flush it: nothing else is coming.
		const agentMessages = items.filter((i) => i?.kind === "agent_message");
		const agentMessage = agentMessages[agentMessages.length - 1];
		expect(
			agentMessage && "text" in agentMessage ? agentMessage.text : "",
		).toBe("Shipped.");

		await adapter.dispose();
	});

	it("gives each replayed user prompt its own turn, in order", async () => {
		const agent = new FakeAcpAgent();
		let counter = 0;
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			// A replay arrives faster than the clock ticks, so ordering can never
			// lean on the timestamp alone.
			now: () => 1,
			mintId: () => `id-${++counter}`,
		});
		const events: AdapterEvent[] = [];
		void collect(
			adapter.start({ cwd: "/work", resume: { harnessSessionId: "sess-1" } }),
			events,
		);
		await flush(40);

		const text = (item: unknown): string => {
			const i = item as {
				kind: string;
				text?: string;
				content?: Array<{ text?: string }>;
			};
			return i.kind === "user_message"
				? (i.content?.[0]?.text ?? "")
				: (i.text ?? "");
		};
		const items = events
			.filter((e) => e.kind === "item")
			.map((e) =>
				e.kind === "item" ? { turnId: e.turnId, item: e.item } : null,
			)
			.filter((e) => e !== null);

		const turnOf = (wanted: string): string | undefined =>
			items.find((e) => text(e.item) === wanted)?.turnId;

		const firstPrompt = turnOf("fix the flaky test");
		const firstReply = turnOf("On it.");
		const secondPrompt = turnOf("now ship it");
		const secondReply = turnOf("Shipped.");

		// A prompt and the reply it drew belong together...
		expect(firstPrompt).toBe(firstReply);
		expect(secondPrompt).toBe(secondReply);
		// ...and the two exchanges must not collapse into one group, whose order
		// would then be decided by item id.
		expect(firstPrompt).not.toBe(secondPrompt);

		// Within a turn the prompt has to precede the reply it drew. Items that
		// share a millisecond are ordered by item id, and "agent_message" sorts
		// ahead of "user_message", so equal stamps put the answer first.
		const startOf = (wanted: string): number => {
			const hit = items.find((e) => text(e.item) === wanted);
			return (hit?.item as { startedAtMs: number }).startedAtMs;
		};
		expect(startOf("fix the flaky test")).toBeLessThan(startOf("On it."));
		expect(startOf("now ship it")).toBeLessThan(startOf("Shipped."));

		// Turn starts have to separate too, or the groups sort by turn id.
		const starts = events
			.filter((e) => e.kind === "turn")
			.map((e) => (e.kind === "turn" ? e.turn.startedAtMs : 0));
		expect(starts.length).toBe(2);
		expect(starts[1]).toBeGreaterThan(starts[0] as number);

		await adapter.dispose();
	});

	it("opens a new session when there is no transcript to resume", async () => {
		const agent = new FakeAcpAgent();
		agent.loadFails = true;
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			now: () => 1,
			mintId: () => "x",
		});
		const events: AdapterEvent[] = [];
		void collect(
			adapter.start({ cwd: "/work", resume: { harnessSessionId: "sess-1" } }),
			events,
		);
		await flush(40);

		// An agent that was never prompted has nothing to load, so the chat has
		// to open one rather than stall on an error nobody can act on.
		expect(agent.sent.map((f) => f.method)).toEqual([
			"initialize",
			"session/load",
			"session/new",
		]);
		const statuses = events
			.filter((e) => e.kind === "session")
			.map((e) => (e.kind === "session" ? e.session.status : null));
		expect(statuses).toContain("idle");
		expect(statuses).not.toContain("dead");

		// The caller asked for sess-1 and did not get it; it has to be told which
		// session the chat actually ended up on, or its stored id stays dead.
		const bound = events
			.filter((e) => e.kind === "session")
			.map((e) =>
				e.kind === "session" ? e.session.harnessSessionId : undefined,
			)
			.filter((id) => id !== undefined)
			.pop();
		expect(bound).toBe("sess-1");

		// Quietly: an error the reader cannot act on is worse than a plain note.
		const notice = events
			.filter((e) => e.kind === "item")
			.map((e) => (e.kind === "item" ? e.item : null))
			.find((i) => i?.kind === "notice");
		expect(notice && "noticeKind" in notice ? notice.noticeKind : "").toBe(
			"info",
		);

		await adapter.dispose();
	});

	it("asks for the newest protocol version it speaks", async () => {
		const agent = new FakeAcpAgent();
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			now: () => 1,
			mintId: () => "x",
		});
		void collect(adapter.start({ cwd: "/work" }), []);
		await flush();

		const initialize = agent.sent.find((f) => f.method === "initialize");
		expect(
			(initialize?.params as { protocolVersion?: number })?.protocolVersion,
		).toBe(2);

		await adapter.dispose();
	});

	// An agent that only speaks v1 answers 1, and the session has to run on
	// that rather than on what was asked for.
	it("runs on the version the agent answers with", async () => {
		for (const version of [1, 2]) {
			const agent = new FakeAcpAgent();
			agent.protocolVersion = version;
			const adapter = new AcpAdapter({
				command: "fake",
				createTransport: (_opts, handlers) => agent.transport(handlers),
				now: () => 1,
				mintId: () => "x",
			});
			const events: AdapterEvent[] = [];
			void collect(adapter.start({ cwd: "/work" }), events);
			await flush(40);

			// Whatever it settled on, the session still opens and works.
			const statuses = events
				.filter((e) => e.kind === "session")
				.map((e) => (e.kind === "session" ? e.session.status : null));
			expect(statuses).toContain("idle");
			expect(statuses).not.toContain("dead");
			await adapter.dispose();
		}
	});

	it("forks when the agent says it can, and declines when it does not", async () => {
		const forking = new FakeAcpAgent();
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => forking.transport(handlers),
			now: () => 1,
			mintId: () => "x",
		});
		void collect(adapter.start({ cwd: "/work" }), []);
		await flush(40);
		expect(await adapter.fork()).toBe("sess-forked");
		await adapter.dispose();

		// An agent that advertises no fork capability is never asked.
		const plain = new FakeAcpAgent();
		plain.sessionCapabilities = null;
		const second = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => plain.transport(handlers),
			now: () => 1,
			mintId: () => "x",
		});
		void collect(second.start({ cwd: "/work" }), []);
		await flush(40);
		expect(await second.fork()).toBeNull();
		expect(plain.sent.map((f) => f.method)).not.toContain("session/fork");
		await second.dispose();
	});

	it("surfaces the agent's own slash commands", async () => {
		const agent = new FakeAcpAgent();
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			now: () => 1,
			mintId: () => "x",
		});
		const events: AdapterEvent[] = [];
		void collect(adapter.start({ cwd: "/work" }), events);
		await flush();

		(
			agent as unknown as { deliver: (f: Record<string, unknown>) => void }
		).deliver({
			jsonrpc: "2.0",
			method: "session/update",
			params: {
				sessionId: "sess-1",
				update: {
					sessionUpdate: "available_commands_update",
					availableCommands: [
						{ name: "review", description: "Review the diff" },
						{ name: "compact", description: "Compact the context" },
						{ name: "", description: "dropped: no name" },
					],
				},
			},
		});
		await flush();

		const sessions = events
			.filter((e) => e.kind === "session")
			.map((e) => (e.kind === "session" ? e.session : null));
		const commands = sessions
			.map((s) => s?.availableCommands)
			.filter((c) => c !== undefined)
			.pop();
		expect(commands).toEqual([
			{ name: "review", description: "Review the diff" },
			{ name: "compact", description: "Compact the context" },
		]);

		await adapter.dispose();
	});

	it("ignores the user_message_chunk echo of a live prompt", async () => {
		const agent = new FakeAcpAgent();
		let counter = 0;
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			now: () => 1,
			mintId: () => `id-${++counter}`,
		});
		const events: AdapterEvent[] = [];
		void collect(adapter.start({ cwd: "/work" }), events);
		await flush();
		adapter.prompt([{ type: "text", text: "hi" }]);
		await flush();

		(
			agent as unknown as { deliver: (f: Record<string, unknown>) => void }
		).deliver({
			jsonrpc: "2.0",
			method: "session/update",
			params: {
				sessionId: "sess-1",
				update: {
					sessionUpdate: "user_message_chunk",
					content: { type: "text", text: "hi" },
				},
			},
		});
		await flush();

		const userMessages = events
			.filter((e) => e.kind === "item")
			.map((e) => (e.kind === "item" ? e.item : null))
			.filter((i) => i?.kind === "user_message");
		expect(userMessages).toEqual([]);

		await adapter.dispose();
	});

	it("surfaces a permission request and forwards the selected option", async () => {
		const agent = new FakeAcpAgent();
		let counter = 0;
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			now: () => 1,
			mintId: () => `id-${++counter}`,
		});
		const events: AdapterEvent[] = [];
		void collect(adapter.start({ cwd: "/work" }), events);
		await flush();
		adapter.prompt([{ type: "text", text: "run" }]);
		await flush();

		agent.requestPermission("sess-1", "tc-1");
		await flush();

		const approval = events
			.filter((e) => e.kind === "item")
			.map((e) => (e.kind === "item" ? e.item : null))
			.find((i) => i?.kind === "approval_request");
		expect(approval?.id).toBe("approval:tc-1");

		adapter.respondToApproval("approval:tc-1", {
			type: "option",
			optionId: "allow",
		});
		await flush();

		const response = agent.lastPermissionResponse();
		expect(response?.result).toEqual({
			outcome: { outcome: "selected", optionId: "allow" },
		});

		await adapter.dispose();
	});
});

describe("AcpAdapter on protocol v2", () => {
	// v2 dropped `tool_call`, so the only variant that can open one is the
	// update, and it has to create as well as amend.
	it("creates a tool call from a tool_call_update", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-9",
			name: "Read",
			title: "Read file",
			kind: "read",
			status: "in_progress",
			// v2 sends null for the fields it is not setting, and a null that fails
			// to parse would drop the whole update.
			content: null,
			locations: null,
		});
		await flush();

		const toolCall = itemsOf(events).find((i) => i.kind === "tool_call");
		expect(toolCall?.id).toBe("tc-9");
		expect(toolCall && "toolKind" in toolCall ? toolCall.toolKind : "").toBe(
			"read",
		);
		expect(toolCall && "toolName" in toolCall ? toolCall.toolName : "").toBe(
			"Read",
		);
		expect(toolCall && "status" in toolCall ? toolCall.status : "").toBe(
			"running",
		);

		await adapter.dispose();
	});

	it("appends tool_call_content_chunk output and keeps it across updates", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-1",
			title: "Run tests",
			kind: "execute",
		});
		for (const text of ["first", "second"]) {
			agent.notify("sess-1", {
				sessionUpdate: "tool_call_content_chunk",
				toolCallId: "tc-1",
				content: { type: "content", content: { type: "text", text } },
			});
		}
		// An update that says nothing about content must not drop what streamed.
		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-1",
			status: "completed",
		});
		await flush();

		const toolCalls = itemsOf(events).filter((i) => i.kind === "tool_call");
		const last = toolCalls[toolCalls.length - 1];
		expect(last && "content" in last ? last.content : []).toEqual([
			{ type: "text", text: "first" },
			{ type: "text", text: "second" },
		]);
		expect(last && "status" in last ? last.status : "").toBe("completed");

		await adapter.dispose();
	});

	it("takes the session state from a state_update", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "state_update",
			state: "requires_action",
		});
		await flush();
		expect(sessionsOf(events).map((s) => s.status)).toContain("awaiting_input");

		agent.notify("sess-1", {
			sessionUpdate: "state_update",
			state: "idle",
			stopReason: "end_turn",
		});
		await flush();
		expect(sessionsOf(events).pop()?.status).toBe("idle");

		// A state v2 reserves for later must not reset the session.
		const before = sessionsOf(events).length;
		agent.notify("sess-1", { sessionUpdate: "state_update", state: "unknown" });
		await flush();
		expect(sessionsOf(events).length).toBe(before);

		await adapter.dispose();
	});

	it("starts in the harness default mode when the client asks for none", async () => {
		const agent = new FakeAcpAgent();
		agent.newSessionConfigOptions = [
			{
				configId: "mode",
				name: "Mode",
				type: "select",
				category: "mode",
				currentValue: "default",
				options: [
					{ value: "default", name: "Ask for approval" },
					{ value: "bypassPermissions", name: "Full access" },
				],
			},
		];
		const { adapter, events } = startAdapter(
			agent,
			undefined,
			{},
			{ defaultModeId: "bypassPermissions" },
		);
		await flush();

		const sent = agent.sent.find(
			(f) => f.method === "session/set_config_option",
		);
		expect(sent?.params).toMatchObject({
			configId: "mode",
			value: "bypassPermissions",
		});
		expect(sessionsOf(events).pop()?.modeId).toBe("bypassPermissions");

		await adapter.dispose();
	});

	it("sets the default mode over session/set_mode on a v1 agent", async () => {
		const agent = new FakeAcpAgent();
		agent.protocolVersion = 1;
		agent.newSessionModes = {
			currentModeId: "default",
			availableModes: [
				{ id: "default", name: "Ask for approval" },
				{ id: "bypassPermissions", name: "Full access" },
			],
		};
		const { adapter, events } = startAdapter(
			agent,
			undefined,
			{},
			{ defaultModeId: "bypassPermissions" },
		);
		await flush();

		const sent = agent.sent.find((f) => f.method === "session/set_mode");
		expect(sent?.params).toEqual({
			sessionId: "sess-1",
			modeId: "bypassPermissions",
		});
		expect(sessionsOf(events).pop()?.modeId).toBe("bypassPermissions");

		await adapter.dispose();
	});

	it("keeps a resumed session's own mode instead of the harness default", async () => {
		const agent = new FakeAcpAgent();
		agent.loadConfigOptions = [
			{
				configId: "mode",
				name: "Mode",
				type: "select",
				category: "mode",
				currentValue: "default",
				options: [
					{ value: "default", name: "Ask for approval" },
					{ value: "bypassPermissions", name: "Full access" },
				],
			},
		];
		const { adapter, events } = startAdapter(
			agent,
			"sess-1",
			{},
			{ defaultModeId: "bypassPermissions" },
		);
		await flush();

		expect(
			agent.sent.some((f) => f.method === "session/set_config_option"),
		).toBe(false);
		expect(
			sessionsOf(events).flatMap((session) =>
				session.modeId ? [session.modeId] : [],
			),
		).toEqual(["default"]);

		await adapter.dispose();
	});

	it("applies the harness default when a resume falls back to a new session", async () => {
		const agent = new FakeAcpAgent();
		agent.loadFails = true;
		agent.newSessionConfigOptions = [
			{
				configId: "mode",
				name: "Mode",
				type: "select",
				category: "mode",
				currentValue: "default",
				options: [
					{ value: "default", name: "Ask for approval" },
					{ value: "bypassPermissions", name: "Full access" },
				],
			},
		];
		const { adapter } = startAdapter(
			agent,
			"sess-gone",
			{},
			{ defaultModeId: "bypassPermissions" },
		);
		await flush(16);

		const sent = agent.sent.find(
			(f) => f.method === "session/set_config_option",
		);
		expect(sent?.params).toMatchObject({ value: "bypassPermissions" });

		await adapter.dispose();
	});

	it("opens in the agent's own mode when asked for the agent default", async () => {
		const agent = new FakeAcpAgent();
		agent.newSessionConfigOptions = [
			{
				configId: "mode",
				name: "Mode",
				type: "select",
				category: "mode",
				currentValue: "default",
				options: [
					{ value: "default", name: "Ask for approval" },
					{ value: "bypassPermissions", name: "Full access" },
				],
			},
		];
		const { adapter } = startAdapter(
			agent,
			undefined,
			{ modeId: AGENT_DEFAULT_MODE },
			{ defaultModeId: "bypassPermissions" },
		);
		await flush();

		expect(agent.sent.map((f) => f.method)).not.toContain(
			"session/set_config_option",
		);

		await adapter.dispose();
	});

	it("holds a prompt until the agent answers the start mode", async () => {
		const agent = new FakeAcpAgent();
		agent.holdSelections = true;
		agent.newSessionConfigOptions = [
			{
				configId: "mode",
				name: "Mode",
				type: "select",
				category: "mode",
				currentValue: "default",
				options: [
					{ value: "default", name: "Ask for approval" },
					{ value: "bypassPermissions", name: "Full access" },
				],
			},
		];
		const { adapter } = startAdapter(
			agent,
			undefined,
			{},
			{ defaultModeId: "bypassPermissions" },
		);
		adapter.prompt([{ type: "text", text: "go" }]);
		await flush(16);

		const methods = () => agent.sent.map((f) => f.method);
		expect(methods()).toContain("session/set_config_option");
		expect(methods()).not.toContain("session/prompt");

		agent.releaseSelections();
		await flush(16);
		expect(methods().indexOf("session/prompt")).toBeGreaterThan(
			methods().indexOf("session/set_config_option"),
		);

		await adapter.dispose();
	});

	it("puts the mode back when the agent rejects a change", async () => {
		const agent = new FakeAcpAgent();
		agent.newSessionConfigOptions = [
			{
				configId: "mode",
				name: "Mode",
				type: "select",
				category: "mode",
				currentValue: "bypassPermissions",
				options: [
					{ value: "default", name: "Ask for approval" },
					{ value: "bypassPermissions", name: "Full access" },
				],
			},
		];
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.rejectSelections = true;
		adapter.setMode("default");
		await flush();

		expect(sessionsOf(events).pop()?.modeId).toBe("bypassPermissions");
		expect(
			itemsOf(events).some(
				(item) => item.kind === "notice" && item.noticeKind === "error",
			),
		).toBe(true);

		await adapter.dispose();
	});

	it("says so when a prompt goes out before a change is confirmed", async () => {
		const agent = new FakeAcpAgent();
		agent.holdSelections = true;
		agent.newSessionConfigOptions = [
			{
				configId: "mode",
				name: "Mode",
				type: "select",
				category: "mode",
				currentValue: "default",
				options: [
					{ value: "default", name: "Ask for approval" },
					{ value: "bypassPermissions", name: "Full access" },
				],
			},
		];
		const { adapter, events } = startAdapter(
			agent,
			undefined,
			{},
			{ defaultModeId: "bypassPermissions", selectionWaitMs: 5 },
		);
		adapter.prompt([{ type: "text", text: "go" }]);
		await Bun.sleep(20);
		await flush();

		expect(agent.sent.map((f) => f.method)).toContain("session/prompt");
		expect(
			itemsOf(events).some(
				(item) =>
					item.kind === "notice" &&
					typeof item.text === "string" &&
					item.text.includes("did not confirm a mode or model change"),
			),
		).toBe(true);

		await adapter.dispose();
	});

	it("lets a requested start mode win over the harness default", async () => {
		const agent = new FakeAcpAgent();
		agent.newSessionConfigOptions = [
			{
				configId: "mode",
				name: "Mode",
				type: "select",
				category: "mode",
				currentValue: "default",
				options: [
					{ value: "default", name: "Ask for approval" },
					{ value: "acceptEdits", name: "Approve edits" },
					{ value: "bypassPermissions", name: "Full access" },
				],
			},
		];
		const { adapter } = startAdapter(
			agent,
			undefined,
			{ modeId: "acceptEdits" },
			{ defaultModeId: "bypassPermissions" },
		);
		await flush();

		const sent = agent.sent.filter(
			(f) => f.method === "session/set_config_option",
		);
		expect(sent.map((f) => (f.params as { value: string }).value)).toEqual([
			"acceptEdits",
		]);

		await adapter.dispose();
	});

	// v2 has no modes at all: the mode is a `select` config option, and
	// `session/set_config_option` replaces `session/set_mode`.
	it("takes the mode from a config_option_update and sets it back", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "config_option_update",
			configOptions: [
				{
					configId: "model",
					name: "Model",
					type: "select",
					category: "model",
					currentValue: "opus",
					options: [{ value: "opus", name: "Opus" }],
				},
				{
					configId: "mode",
					name: "Mode",
					type: "select",
					category: "mode",
					currentValue: "plan",
					options: [
						{ value: "plan", name: "Plan" },
						{ value: "code", name: "Code" },
					],
				},
			],
		});
		await flush();

		const session = sessionsOf(events).pop();
		expect(session?.modeId).toBe("plan");
		expect(session?.availableModes).toEqual([
			{ id: "plan", label: "Plan" },
			{ id: "code", label: "Code" },
		]);

		adapter.setMode("code");
		await flush();
		const sent = agent.sent.find(
			(f) => f.method === "session/set_config_option",
		);
		expect(sent?.params).toEqual({
			sessionId: "sess-1",
			configId: "mode",
			type: "id",
			value: "code",
		});
		expect(agent.sent.map((f) => f.method)).not.toContain("session/set_mode");

		await adapter.dispose();
	});

	it("lists a background task from its spawn until it ends", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "async_task_spawned",
			asyncTaskId: "task-1",
			name: "bun run dev",
			canStop: true,
		});
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "async_task_state_update",
			asyncTaskId: "task-1",
			state: "completed",
		});
		await flush();

		const lists = events.flatMap((event) =>
			event.kind === "session" && event.session.backgroundTasks
				? [event.session.backgroundTasks.map((task) => task.name)]
				: [],
		);
		expect(lists).toEqual([["bun run dev"], []]);

		await adapter.dispose();
	});

	it("reports a running turn as awaiting background work once the agent's cycle ends", async () => {
		const agent = new FakeAcpAgent();
		agent.steeringOutcome = "injected";
		agent.holdPrompts = true;
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "spawn a helper" }]);
		await flush();
		const awaiting = () =>
			sessionsOf(events)
				.filter((session) => session.awaitingBackground !== undefined)
				.map((session) => session.awaitingBackground);

		agent.notify("sess-1", {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-1",
			name: "Helper",
			task: "Help",
		});
		agent.notify("sess-1", {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "Launched." },
		});
		await flush();
		expect(awaiting()).toEqual([]);

		agent.notify("sess-1", {
			sessionUpdate: "usage_update",
			used: 10,
			size: 100,
			cost: { amount: 0.01, currency: "USD" },
		});
		await flush();
		expect(awaiting()).toEqual([true]);

		agent.notify("sess-1", {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "Answering you." },
		});
		await flush();
		expect(awaiting()).toEqual([true, false]);

		await adapter.dispose();
	});

	it("records a reply in full when the agent's cycle ends, not when the next item starts", async () => {
		const agent = new FakeAcpAgent();
		agent.holdPrompts = true;
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "say hi" }]);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "Hello " },
		});
		agent.notify("sess-1", {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "there." },
		});
		agent.notify("sess-1", {
			sessionUpdate: "usage_update",
			used: 10,
			size: 100,
			cost: { amount: 0.01, currency: "USD" },
		});
		await flush();

		const recorded = events.flatMap((event) =>
			event.kind === "item" && event.item.kind === "agent_message"
				? [(event.item as { text: string }).text]
				: [],
		);
		expect(recorded.at(-1)).toBe("Hello there.");
		await adapter.dispose();
	});

	it("treats a steered turn as working until the steered reply streams", async () => {
		const agent = new FakeAcpAgent();
		agent.steeringOutcome = "injected";
		agent.holdPrompts = true;
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "spawn a helper" }]);
		await flush();
		const awaiting = () =>
			sessionsOf(events)
				.filter((session) => session.awaitingBackground !== undefined)
				.map((session) => session.awaitingBackground);
		const cycleEnds = () =>
			agent.notify("sess-1", {
				sessionUpdate: "usage_update",
				used: 10,
				size: 100,
				cost: { amount: 0.01, currency: "USD" },
			});
		agent.notify("sess-1", {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-1",
			name: "Helper",
			task: "Help",
		});
		cycleEnds();
		await flush();
		expect(awaiting()).toEqual([true]);

		await adapter.steer([{ type: "text", text: "and this" }]);
		expect(awaiting()).toEqual([true, false]);

		cycleEnds();
		await flush();
		expect(awaiting()).toEqual([true, false]);

		agent.notify("sess-1", {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "Answer." },
		});
		cycleEnds();
		await flush();
		expect(awaiting()).toEqual([true, false, true]);

		await adapter.dispose();
	});

	it("does not count a background task left over from an earlier turn", async () => {
		const agent = new FakeAcpAgent();
		agent.steeringOutcome = "injected";
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "start the dev server" }]);
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "async_task_spawned",
			asyncTaskId: "task-1",
			name: "bun run dev",
			canStop: true,
		});
		await flush();

		agent.holdPrompts = true;
		adapter.prompt([{ type: "text", text: "now something else" }]);
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "usage_update",
			used: 10,
			size: 100,
			cost: { amount: 0.01, currency: "USD" },
		});
		await flush();

		expect(
			sessionsOf(events).some((session) => session.awaitingBackground),
		).toBe(false);
		await adapter.dispose();
	});

	it("never reports awaiting background work for an agent that cannot steer", async () => {
		const agent = new FakeAcpAgent();
		agent.holdPrompts = true;
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "spawn a helper" }]);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-1",
			name: "Helper",
			task: "Help",
		});
		agent.notify("sess-1", {
			sessionUpdate: "usage_update",
			used: 10,
			size: 100,
			cost: { amount: 0.01, currency: "USD" },
		});
		await flush();

		expect(
			sessionsOf(events).some((session) => session.awaitingBackground),
		).toBe(false);
		await adapter.dispose();
	});

	it("shows a subagent from its spawn until its state ends, keeping its session out of the transcript", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(
			agent,
			undefined,
			{},
			{
				backgroundDetailIntervalMs: 0,
			},
		);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-1",
			name: "Count files",
			task: "Count the files",
		});
		agent.notify("child-1", {
			sessionUpdate: "tool_call",
			toolCallId: "bash-1",
			title: "find . | wc -l",
			kind: "execute",
			status: "pending",
		});
		agent.notify("sess-1", {
			sessionUpdate: "subagent_state_update",
			subagentSessionId: "child-1",
			state: "completed",
		});
		await flush();

		const toolCalls = itemsOf(events).filter((i) => i.kind === "tool_call");
		expect(toolCalls.map((i) => i.id)).not.toContain("bash-1");
		expect(toolCalls.at(-1)).toMatchObject({
			title: "Count files",
			subagent: true,
			status: "completed",
		});
		const lists = events.flatMap((event) =>
			event.kind === "session" && event.session.backgroundTasks
				? [
						event.session.backgroundTasks.map(
							(task) => `${task.kind}:${task.name}`,
						),
					]
				: [],
		);
		expect(lists).toEqual([["subagent:Count files"], []]);
		const steps = events.flatMap((event) =>
			event.kind === "delta" && event.delta.type === "background"
				? [event.delta]
				: [],
		);
		expect(steps).toEqual([
			{
				type: "background",
				itemId: "subagent:child-1",
				append: "find . | wc -l",
			},
		]);

		await adapter.dispose();
	});

	it("drops a parent update for a subagent call it never opened, but keeps an untitled new call", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "agent-1",
			status: "completed",
			_meta: { claudeCode: { toolName: "Agent" } },
		});
		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "read-1",
			kind: "read",
			status: "in_progress",
		});
		await flush();

		const ids = itemsOf(events)
			.filter((i) => i.kind === "tool_call")
			.map((i) => i.id);
		expect(ids).not.toContain("agent-1");
		expect(ids).toContain("read-1");

		await adapter.dispose();
	});

	it("fails running subagents when the agent process exits", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-1",
			name: "Review",
		});
		await flush();
		agent.exit(1);
		await flush();

		const statuses = itemsOf(events).flatMap((i) =>
			i.kind === "tool_call" && i.subagent === true ? [i.status] : [],
		);
		expect(statuses).toEqual(["running", "failed"]);

		await adapter.dispose();
	});

	it("takes the chat title only from its own session", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("child-1", {
			sessionUpdate: "session_info_update",
			title: "Count files",
		});
		agent.notify("sess-1", {
			sessionUpdate: "session_info_update",
			title: "Fix the docs",
		});
		await flush();

		const titles = events.flatMap((event) =>
			event.kind === "session" && event.session.title
				? [event.session.title]
				: [],
		);
		expect(titles).toEqual(["Fix the docs"]);

		await adapter.dispose();
	});

	it("shows a failed subagent spawn the parent never opened", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "tool_call",
			toolCallId: "agent-1",
			title: "Agent",
			status: "failed",
			_meta: { claudeCode: { toolName: "Agent" } },
		});
		await flush();

		expect(
			itemsOf(events).some((i) => i.kind === "tool_call" && i.id === "agent-1"),
		).toBe(true);

		await adapter.dispose();
	});

	it("keeps a finished subagent finished when a late spawn arrives", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		const spawn = {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-1",
			name: "Review",
		};
		agent.notify("sess-1", spawn);
		agent.notify("sess-1", {
			sessionUpdate: "subagent_state_update",
			subagentSessionId: "child-1",
			state: "completed",
		});
		agent.notify("sess-1", spawn);
		await flush();

		const statuses = itemsOf(events).flatMap((i) =>
			i.kind === "tool_call" && i.subagent === true ? [i.status] : [],
		);
		expect(statuses).toEqual(["running", "completed"]);

		await adapter.dispose();
	});

	it("keeps updates from a session it does not track out of the transcript", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("other-session", {
			sessionUpdate: "tool_call",
			toolCallId: "stray-1",
			title: "ls",
			kind: "execute",
			status: "pending",
		});
		await flush();

		expect(
			itemsOf(events).some((i) => i.kind === "tool_call" && i.id === "stray-1"),
		).toBe(false);

		await adapter.dispose();
	});

	it("shows a disconnected subagent as failed", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-1",
			name: "Review",
		});
		agent.notify("sess-1", {
			sessionUpdate: "subagent_state_update",
			subagentSessionId: "child-1",
			state: "disconnected",
		});
		await flush();

		const statuses = itemsOf(events).flatMap((i) =>
			i.kind === "tool_call" && i.subagent === true ? [i.status] : [],
		);
		expect(statuses).toEqual(["running", "failed"]);
		await adapter.dispose();
	});

	it("refuses to stop a task it does not know", async () => {
		const agent = new FakeAcpAgent();
		const { adapter } = startAdapter(agent);
		await flush();

		expect(await adapter.stopBackgroundTask("unknown")).toBe(false);
		expect(agent.sent.map((f) => f.method)).not.toContain(
			"_session/async_task/stop",
		);
		await adapter.dispose();
	});

	it("folds a v2 subagent_update into the same lifecycle", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "subagent_update",
			sessionId: "child-1",
			title: "Test runner",
		});
		agent.notify("sess-1", {
			sessionUpdate: "subagent_update",
			sessionId: "child-1",
			state: { state: "completed" },
		});
		await flush();

		const statuses = itemsOf(events).flatMap((i) =>
			i.kind === "tool_call" && i.subagent === true ? [i.status] : [],
		);
		expect(statuses).toEqual(["running", "completed"]);

		await adapter.dispose();
	});

	it("patches the streamed message a whole agent_message names", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "agent_message_chunk",
			messageId: "m1",
			content: { type: "text", text: "Partial" },
		});
		agent.notify("sess-1", {
			sessionUpdate: "agent_message",
			messageId: "m1",
			content: [{ type: "text", text: "Final answer" }],
		});
		await flush();

		const messages = itemsOf(events).filter((i) => i.kind === "agent_message");
		// The whole message replaces what streamed rather than landing beside it.
		expect(new Set(messages.map((i) => i.id)).size).toBe(1);
		expect(textOf(messages[messages.length - 1])).toBe("Final answer");

		// A new message id starts a new item.
		agent.notify("sess-1", {
			sessionUpdate: "agent_message_chunk",
			messageId: "m2",
			content: { type: "text", text: "Next" },
		});
		await flush();
		const ids = new Set(
			itemsOf(events)
				.filter((i) => i.kind === "agent_message")
				.map((i) => i.id),
		);
		expect(ids.size).toBe(2);

		await adapter.dispose();
	});

	it("ignores a whole user_message echoed live", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "hi" }]);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "user_message",
			messageId: "u1",
			content: [{ type: "text", text: "hi" }],
		});
		await flush();

		expect(itemsOf(events).filter((i) => i.kind === "user_message")).toEqual(
			[],
		);

		await adapter.dispose();
	});

	it("records whole messages replayed by session/load", async () => {
		const agent = new FakeAcpAgent();
		agent.wholeMessageReplay = true;
		const { adapter, events } = startAdapter(agent, "sess-1");
		await flush(40);

		const items = itemsOf(events);
		const userMessage = items.find((i) => i.kind === "user_message");
		expect(
			userMessage && "content" in userMessage ? userMessage.content : [],
		).toEqual([{ type: "text", text: "fix the flaky test" }]);
		const agentMessages = items.filter((i) => i.kind === "agent_message");
		expect(textOf(agentMessages[agentMessages.length - 1])).toBe("On it.");

		await adapter.dispose();
	});

	it("maps a plan_update's entries", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "plan_update",
			plan: {
				type: "items",
				planId: "p1",
				entries: [
					{ content: "Read the code", priority: "high", status: "completed" },
					{ content: "Fix it", priority: "high", status: "in_progress" },
				],
			},
		});
		await flush();

		const plan = itemsOf(events).find((i) => i.kind === "plan");
		expect(plan && "entries" in plan ? plan.entries : []).toEqual([
			{ text: "Read the code", status: "completed" },
			{ text: "Fix it", status: "in_progress" },
		]);

		await adapter.dispose();
	});

	it("advertises the client info v2 requires in initialize", async () => {
		const agent = new FakeAcpAgent();
		const { adapter } = startAdapter(agent);
		await flush();

		const initialize = agent.sent.find((f) => f.method === "initialize");
		const params = initialize?.params as {
			protocolVersion?: number;
			info?: { name?: string; version?: string };
			capabilities?: unknown;
			clientCapabilities?: unknown;
		};
		expect(params.protocolVersion).toBe(2);
		expect(params.info?.name).toBe("superset");
		expect(params.info?.version).toBeString();
		// v2 renamed the field; v1 agents still read the old name.
		expect(params.capabilities).toEqual({ _meta: AIR_CLIENT_META });
		expect(params.clientCapabilities).toBeDefined();

		await adapter.dispose();
	});

	// A v1 agent must not be handed v2 methods.
	it("still sets the mode with session/set_mode on v1", async () => {
		const agent = new FakeAcpAgent();
		agent.protocolVersion = 1;
		const { adapter } = startAdapter(agent);
		await flush();

		adapter.setMode("plan");
		await flush();

		const sent = agent.sent.find((f) => f.method === "session/set_mode");
		expect(sent?.params).toEqual({ sessionId: "sess-1", modeId: "plan" });
		expect(agent.sent.map((f) => f.method)).not.toContain(
			"session/set_config_option",
		);

		await adapter.dispose();
	});
});

describe("AcpAdapter config options", () => {
	const MODEL_OPTION = {
		id: "model",
		name: "Model",
		type: "select",
		category: "model",
		currentValue: "opus",
		options: [
			{ value: "opus", name: "Opus", description: "For complex work" },
			{ value: "sonnet", name: "Sonnet" },
		],
	};
	const EFFORT_OPTION = {
		id: "effort",
		name: "Effort",
		type: "select",
		category: "thought_level",
		currentValue: "high",
		options: [
			{ value: "low", name: "Low" },
			{ value: "high", name: "High" },
		],
	};

	it("reads the options session/new returns, keyed by v1's id", async () => {
		const agent = new FakeAcpAgent();
		agent.protocolVersion = 1;
		agent.newSessionConfigOptions = [MODEL_OPTION, EFFORT_OPTION];
		const { adapter, events } = startAdapter(agent);
		await flush();

		expect(sessionsOf(events).pop()?.configOptions).toEqual([
			{
				id: "model",
				label: "Model",
				category: "model",
				currentValue: "opus",
				options: [
					{ id: "opus", label: "Opus", description: "For complex work" },
					{ id: "sonnet", label: "Sonnet" },
				],
			},
			{
				id: "effort",
				label: "Effort",
				category: "thought_level",
				currentValue: "high",
				options: [
					{ id: "low", label: "Low" },
					{ id: "high", label: "High" },
				],
			},
		]);

		await adapter.dispose();
	});

	it("sets an option and shows the new value before the agent answers", async () => {
		const agent = new FakeAcpAgent();
		agent.protocolVersion = 1;
		agent.newSessionConfigOptions = [MODEL_OPTION];
		const { adapter, events } = startAdapter(agent);
		await flush();

		adapter.setConfigOption("model", "sonnet");
		await flush();

		expect(sessionsOf(events).pop()?.configOptions?.[0]?.currentValue).toBe(
			"sonnet",
		);
		const sent = agent.sent.find(
			(f) => f.method === "session/set_config_option",
		);
		expect(sent?.params).toEqual({
			sessionId: "sess-1",
			configId: "model",
			value: "sonnet",
		});

		await adapter.dispose();
	});

	it("applies the model it was started with", async () => {
		const agent = new FakeAcpAgent();
		agent.protocolVersion = 1;
		agent.newSessionConfigOptions = [MODEL_OPTION];
		const { adapter } = startAdapter(agent, undefined, { modelId: "sonnet" });
		await flush();

		const sent = agent.sent.find(
			(f) => f.method === "session/set_config_option",
		);
		expect(sent?.params).toEqual({
			sessionId: "sess-1",
			configId: "model",
			value: "sonnet",
		});

		await adapter.dispose();
	});

	it("leaves the model alone when the start model is not offered", async () => {
		const agent = new FakeAcpAgent();
		agent.protocolVersion = 1;
		agent.newSessionConfigOptions = [MODEL_OPTION];
		const { adapter } = startAdapter(agent, undefined, { modelId: "gpt-5.4" });
		await flush();

		expect(agent.sent.map((f) => f.method)).not.toContain(
			"session/set_config_option",
		);

		await adapter.dispose();
	});
});

describe("AcpAdapter attachments", () => {
	const startWith = (
		agent: FakeAcpAgent,
		resolveAttachment: (id: string) => Promise<{
			path: string;
			mimeType: string;
			data: string;
		} | null>,
	) => {
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			resolveAttachment,
			now: () => 1,
			mintId: () => "id-1",
		});
		const events: AdapterEvent[] = [];
		void collect(adapter.start({ cwd: "/work" }), events);
		return { adapter, events };
	};

	const promptBlocks = (agent: FakeAcpAgent): unknown[] =>
		((
			agent.sent.find((f) => f.method === "session/prompt")?.params as {
				prompt?: unknown[];
			}
		)?.prompt ?? []) as unknown[];

	it("sends an image as content when the agent reads images", async () => {
		const agent = new FakeAcpAgent();
		const { adapter } = startWith(agent, async () => ({
			path: "/tmp/shot.png",
			mimeType: "image/png",
			data: "YmFzZTY0",
		}));
		await flush();
		adapter.prompt([
			{ type: "text", text: "what is this" },
			{
				type: "attachment",
				attachmentId: "a1",
				name: "shot.png",
				mimeType: "image/png",
			},
		]);
		await flush();
		expect(promptBlocks(agent)).toEqual([
			{ type: "text", text: "what is this" },
			{ type: "image", mimeType: "image/png", data: "YmFzZTY0" },
		]);
	});

	it("links a non-image so the agent can open it itself", async () => {
		const agent = new FakeAcpAgent();
		const { adapter } = startWith(agent, async () => ({
			path: "/tmp/notes.md",
			mimeType: "text/markdown",
			data: "ZG9j",
		}));
		await flush();
		adapter.prompt([
			{
				type: "attachment",
				attachmentId: "a2",
				name: "notes.md",
				mimeType: "text/markdown",
			},
		]);
		await flush();
		expect(promptBlocks(agent)).toEqual([
			{
				type: "resource_link",
				uri: "file:///tmp/notes.md",
				name: "notes.md",
				mimeType: "text/markdown",
			},
		]);
	});

	it("names an attachment it could not read", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startWith(agent, async () => null);
		await flush();
		adapter.prompt([
			{
				type: "attachment",
				attachmentId: "gone",
				name: "missing.png",
				mimeType: "image/png",
			},
		]);
		await flush();
		expect(promptBlocks(agent)).toEqual([]);
		const told = events.some(
			(e) =>
				e.kind === "item" &&
				"text" in e.item &&
				/missing\.png/.test(String(e.item.text)),
		);
		expect(told).toBe(true);
	});
});
