import { describe, expect, it, jest } from "bun:test";
import { spawn } from "node:child_process";
import type { Item } from "@superset/chat/protocol";
import { AGENT_DEFAULT_MODE, wrapHiddenText } from "@superset/chat/protocol";
import type { AdapterEvent } from "../types";
import {
	AcpAdapter,
	type AcpAdapterOptions,
	type AcpImageStoreContext,
} from "./acpAdapter";
import { AIR_CLIENT_META } from "./air";
import type { AcpImageSource } from "./imageBlocks";
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
	/** Answer session/load with this error instead. */
	loadError: { code: number; message: string } | null = null;
	/** Answer nothing, as an agent stuck on a login prompt does. */
	silent = false;
	/** What the agent answers `initialize` with; older agents answer 1. */
	protocolVersion = 2;
	/** agentInfo.name reported at initialize, as pdev reports "paradev". */
	agentName: string | null = null;
	/** v2 pdev names itself under `info`, not `agentInfo`. */
	agentInfoField: "agentInfo" | "info" = "agentInfo";
	/** _meta attached to the first scripted agent message chunk. */
	chunkMeta: Record<string, unknown> | null = null;
	/** Session capabilities advertised at initialize; both shipped agents fork. */
	sessionCapabilities: Record<string, unknown> | null = { fork: {} };
	/** Replay history with v2's whole-message variants instead of chunks. */
	wholeMessageReplay = false;
	replayUpdates: Record<string, unknown>[] | null = null;
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
	private heldPrompts: number[] = [];
	/** Advertise `_session/steering` and answer it with this outcome. */
	steeringOutcome: string | null = null;
	/** Leave session/prompt unanswered, as a turn still running does. */
	holdPrompts = false;
	/** Answer session/prompt once the message is inserted, as a v2 agent does. */
	insertOnPrompt = false;
	/** Report `idle` with this stop reason right behind the insertion response. */
	idleWithInsertion: string | null = null;
	/** Hold inserted prompts, echo and all, until `releaseInsertions`. */
	holdInsertions = false;
	private insertedPrompts = 0;
	/** Reject a subagent's session/prompt, as pdev does once it has finished. */
	finishedSubagents = new Set<string>();
	/** Echo a subagent steer, send these parent updates, then reject the steer. */
	updatesBeforeSteerError: Record<string, unknown>[] | null = null;
	/** Leave subagent steers unanswered until the test answers them. */
	holdChildPrompts = false;
	readonly heldChildPrompts: number[] = [];
	/** Refuse `_sh.superset/subagent/background`, as pdev does once the call returned. */
	refuseBackground = false;
	private heldInsertions: Array<{ id: number; prompt: unknown }> = [];
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

	stderr(chunk: string): void {
		this.handlers.onStderr(chunk);
	}

	notify(sessionId: string, update: Record<string, unknown>): void {
		this.deliver({
			jsonrpc: "2.0",
			method: "session/update",
			params: { sessionId, update },
		});
	}

	/** A permission request from a subagent's own session. */
	requestSubagentPermission(
		sessionId: string,
		toolCallId: string,
		id = 9101,
	): number {
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

	requestSubagentPermissionWithoutToolCall(
		sessionId: string,
		id = 9102,
	): number {
		this.deliver({
			jsonrpc: "2.0",
			id,
			method: "session/request_permission",
			params: {
				sessionId,
				toolCall: { title: "Run tests" },
				options: [
					{ optionId: "allow", name: "Allow", kind: "allow_once" },
					{ optionId: "reject", name: "Reject", kind: "reject_once" },
				],
			},
		});
		return id;
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

	requestPermissionWith(params: Record<string, unknown>, id: number): void {
		this.deliver({
			jsonrpc: "2.0",
			id,
			method: "session/request_permission",
			params: { sessionId: "sess-1", ...params },
		});
	}

	requestPdevPermission(toolCallId: string, id: number): void {
		this.deliver({
			jsonrpc: "2.0",
			id,
			method: "session/request_permission",
			params: {
				sessionId: "sess-1",
				toolCall: { toolCallId, title: "Allow Write hello.txt?" },
				options: [
					{ optionId: "choice-0", name: "Allow once", kind: "allow_once" },
					{
						optionId: "choice-1",
						name: "Allow all edits this session",
						kind: "allow_once",
					},
					{ optionId: "choice-2", name: "Deny", kind: "allow_once" },
				],
			},
		});
	}

	askQuestion(sessionId: string, toolCallId: string): number {
		const id = 9003;
		this.deliver({
			jsonrpc: "2.0",
			id,
			method: "session/request_permission",
			params: {
				sessionId,
				toolCall: { toolCallId, title: "Color: Which color?" },
				options: [
					{ optionId: "choice-0", name: "Red", kind: "allow_once" },
					{ optionId: "choice-1", name: "Blue", kind: "allow_once" },
					{
						optionId: "choice-2",
						name: "Other (type an answer)",
						kind: "allow_once",
					},
				],
			},
		});
		return id;
	}

	requestElicitation(params: Record<string, unknown>, id = 9002): number {
		this.deliver({
			jsonrpc: "2.0",
			id,
			method: "elicitation/create",
			params: { mode: "form", sessionId: "sess-1", ...params },
		});
		return id;
	}

	cancelRequest(requestId: number): void {
		this.deliver({
			jsonrpc: "2.0",
			method: "$/cancel_request",
			params: { requestId },
		});
	}

	private insert(id: number, prompt: unknown, idleBeforeResponse?: string) {
		const messageId = `u${++this.insertedPrompts}`;
		this.notify("sess-1", {
			sessionUpdate: "user_message",
			messageId,
			content: prompt,
		});
		if (idleBeforeResponse) {
			this.notify("sess-1", {
				sessionUpdate: "state_update",
				state: "idle",
				stopReason: idleBeforeResponse,
			});
		}
		this.respond(id, { messageId });
	}

	/** Insert held prompts; `idleBeforeResponse` ends the run between echo and answer. */
	releaseInsertions(idleBeforeResponse?: string): void {
		for (const { id, prompt } of this.heldInsertions.splice(0)) {
			this.insert(id, prompt, idleBeforeResponse);
		}
	}

	answerChildPrompt(id: number, outcome: "inserted" | "rejected"): void {
		if (outcome === "inserted") this.respond(id, { messageId: `steer-${id}` });
		else
			this.deliver({
				jsonrpc: "2.0",
				id,
				error: { code: -32600, message: "The subagent has stopped" },
			});
	}

	releasePrompts(stopReason: string): void {
		for (const id of this.heldPrompts.splice(0)) {
			this.respond(id, { stopReason });
		}
	}

	responseTo(id: number): Record<string, unknown> | undefined {
		return this.sent.find((frame) => frame.id === id && !frame.method);
	}

	releaseSelections(): void {
		for (const id of this.heldSelections.splice(0)) this.respond(id, null);
	}

	releaseFirstSelection(): void {
		const id = this.heldSelections.shift();
		if (id !== undefined) this.respond(id, null);
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
		if (this.silent) return;

		const resumes =
			frame.method === "session/load" || frame.method === "session/resume";
		queueMicrotask(() => {
			if (frame.method === "initialize") {
				this.respond(frame.id as number, {
					...(this.agentName
						? { [this.agentInfoField]: { name: this.agentName } }
						: {}),
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
			} else if (resumes && this.loadError) {
				this.deliver({ jsonrpc: "2.0", id: frame.id, error: this.loadError });
			} else if (resumes && this.loadFails) {
				this.deliver({
					jsonrpc: "2.0",
					id: frame.id,
					error: { code: -32002, message: "Resource not found: sess-1" },
				});
			} else if (resumes && this.replayUpdates) {
				const sessionId = (frame.params as { sessionId: string }).sessionId;
				for (const update of this.replayUpdates) this.notify(sessionId, update);
				this.respond(frame.id as number, null);
			} else if (resumes && this.wholeMessageReplay) {
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
			} else if (resumes && this.loadConfigOptions) {
				const sessionId = (frame.params as { sessionId: string }).sessionId;
				this.notify(sessionId, {
					sessionUpdate: "config_option_update",
					configOptions: this.loadConfigOptions,
				});
				this.respond(frame.id as number, null);
			} else if (resumes) {
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
					sessionUpdate: "user_message_chunk",
					content: { type: "text", text: wrapHiddenText("MCP context") },
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
			} else if (
				frame.method === "session/prompt" &&
				String(frame.params?.sessionId).startsWith("child-")
			) {
				const childId = String(frame.params?.sessionId);
				if (this.finishedSubagents.has(childId)) {
					this.deliver({
						jsonrpc: "2.0",
						id: frame.id,
						error: { code: -32600, message: "The subagent has finished" },
					});
					return;
				}
				if (this.holdChildPrompts) {
					this.heldChildPrompts.push(frame.id as number);
					return;
				}
				const messageId = `steer-${frame.id}`;
				this.notify(childId, {
					sessionUpdate: "user_message",
					messageId,
					content: frame.params?.prompt,
				});
				if (this.updatesBeforeSteerError) {
					for (const update of this.updatesBeforeSteerError)
						this.notify("sess-1", update);
					this.deliver({
						jsonrpc: "2.0",
						id: frame.id,
						error: { code: -32600, message: "The subagent has stopped" },
					});
					return;
				}
				this.respond(frame.id as number, { messageId });
			} else if (frame.method === "_sh.superset/subagent/background") {
				if (this.refuseBackground) {
					this.deliver({
						jsonrpc: "2.0",
						id: frame.id,
						error: {
							code: -32600,
							message: "The subagent c1 is not waiting in the foreground",
						},
					});
					return;
				}
				this.respond(frame.id as number, {});
			} else if (frame.method === "session/prompt" && this.insertOnPrompt) {
				if (this.holdInsertions) {
					this.heldInsertions.push({
						id: frame.id as number,
						prompt: frame.params?.prompt,
					});
					return;
				}
				this.insert(frame.id as number, frame.params?.prompt);
				if (this.idleWithInsertion) {
					this.notify("sess-1", {
						sessionUpdate: "state_update",
						state: "idle",
						stopReason: this.idleWithInsertion,
					});
				}
			} else if (frame.method === "session/prompt" && this.holdPrompts) {
				this.heldPrompts.push(frame.id as number);
			} else if (frame.method === "session/prompt") {
				this.notify("sess-1", {
					sessionUpdate: "agent_message_chunk",
					content: { type: "text", text: "Hello" },
					...(this.chunkMeta ? { _meta: this.chunkMeta } : {}),
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
		| "defaultModeId"
		| "requestTimeoutMs"
		| "clientApprovalModes"
		| "shellPollMs"
		| "backgroundDetailIntervalMs"
		| "startupTimeoutMs"
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
		.filter((e) => e.type === "item")
		.map((e) => (e.type === "item" ? e.item : null))
		.filter((item) => item !== null);
}

function sessionsOf(events: AdapterEvent[]) {
	return events
		.filter((e) => e.type === "session")
		.map((e) => (e.type === "session" ? e.session : null))
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

		const sessions = events.filter((e) => e.type === "session");
		expect(
			sessions.map((e) => (e.type === "session" ? e.session.status : null)),
		).toContain("idle");

		const items = events
			.filter((e) => e.type === "item")
			.map((e) => (e.type === "item" ? e.item : null));
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

		const textDeltas = events.filter((e) => e.type === "delta");
		expect(textDeltas.length).toBe(2);

		const turns = events
			.filter((e) => e.type === "turn")
			.map((e) => (e.type === "turn" ? e.turn.status : null));
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
		agent.protocolVersion = 1;
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

	it("v2 steering sends session/prompt while a turn runs", async () => {
		const agent = new FakeAcpAgent();
		agent.insertOnPrompt = true;
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "first" }]);
		await flush();
		const turns = () =>
			events.flatMap((e) => (e.type === "turn" ? [e.turn] : []));
		const turnId = turns().at(-1)?.id;

		expect(adapter.canSteer()).toBe(true);
		expect(await adapter.steer([{ type: "text", text: "also X" }])).toBe(true);
		const prompts = agent.sent.filter((f) => f.method === "session/prompt");
		expect(prompts).toHaveLength(2);
		expect(prompts[1]?.params).toEqual({
			sessionId: "sess-1",
			prompt: [{ type: "text", text: "also X" }],
		});
		expect(agent.sent.map((f) => f.method)).not.toContain("_session/steering");
		expect(turns().every((turn) => turn.id === turnId)).toBe(true);
		expect(turns().at(-1)?.status).toBe("running");

		await adapter.dispose();
	});

	it("v2 idle in the same chunk as the insertion response completes the turn", async () => {
		const agent = new FakeAcpAgent();
		agent.insertOnPrompt = true;
		agent.idleWithInsertion = "end_turn";
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "hi" }]);
		await flush();

		const turn = events
			.flatMap((e) => (e.type === "turn" ? [e.turn] : []))
			.at(-1);
		expect(turn?.status).toBe("completed");
		expect(sessionsOf(events).at(-1)?.status).toBe("idle");

		await adapter.dispose();
	});

	it("an idle from an earlier run does not end a v2 turn still in flight", async () => {
		const agent = new FakeAcpAgent();
		agent.insertOnPrompt = true;
		agent.holdInsertions = true;
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "hi" }]);
		await flush();
		const lastTurn = () =>
			events.flatMap((e) => (e.type === "turn" ? [e.turn] : [])).at(-1);

		agent.notify("sess-1", {
			sessionUpdate: "state_update",
			state: "idle",
			stopReason: "end_turn",
		});
		agent.releaseInsertions();
		await flush();
		expect(lastTurn()?.status).toBe("running");

		agent.notify("sess-1", {
			sessionUpdate: "state_update",
			state: "idle",
			stopReason: "end_turn",
		});
		await flush();
		expect(lastTurn()?.status).toBe("completed");

		await adapter.dispose();
	});

	it("v2 steer during the first prompt's flight tolerates a stopReason answer", async () => {
		const agent = new FakeAcpAgent();
		agent.holdPrompts = true;
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "first" }]);
		await flush();

		expect(adapter.canSteer()).toBe(true);
		const steered = adapter.steer([{ type: "text", text: "also X" }]);
		await flush();
		agent.releasePrompts("end_turn");

		expect(await steered).toBe(true);
		await flush();
		const turns = events.flatMap((e) => (e.type === "turn" ? [e.turn] : []));
		expect(new Set(turns.map((turn) => turn.id)).size).toBe(1);
		expect(turns.at(-1)?.status).toBe("completed");
		expect(
			agent.sent.filter((f) => f.method === "session/prompt"),
		).toHaveLength(2);

		await adapter.dispose();
	});

	it("v2 steer inserted after its run ended opens a new turn", async () => {
		const agent = new FakeAcpAgent();
		agent.insertOnPrompt = true;
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "first" }]);
		await flush();
		const turns = () =>
			events.flatMap((e) => (e.type === "turn" ? [e.turn] : []));
		const firstId = turns().at(-1)?.id;

		agent.holdInsertions = true;
		const steered = adapter.steer([{ type: "text", text: "also X" }]);
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "state_update",
			state: "idle",
			stopReason: "end_turn",
		});
		agent.releaseInsertions();
		expect(await steered).toBe(true);
		await flush();

		const second = turns().at(-1);
		expect(turns().find((turn) => turn.id === firstId)).toBeDefined();
		expect(second?.id).not.toBe(firstId);
		expect(second?.status).toBe("running");
		expect(sessionsOf(events).at(-1)?.status).toBe("running");

		agent.notify("sess-1", {
			sessionUpdate: "state_update",
			state: "idle",
			stopReason: "end_turn",
		});
		await flush();
		expect(turns().at(-1)).toMatchObject({
			id: second?.id,
			status: "completed",
		});

		await adapter.dispose();
	});

	it("v2 steer inserted before its run ended opens no new turn", async () => {
		const agent = new FakeAcpAgent();
		agent.insertOnPrompt = true;
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "first" }]);
		await flush();

		agent.holdInsertions = true;
		const steered = adapter.steer([{ type: "text", text: "also X" }]);
		await flush();
		agent.releaseInsertions("end_turn");
		expect(await steered).toBe(true);
		await flush();

		const turns = events.flatMap((e) => (e.type === "turn" ? [e.turn] : []));
		expect(new Set(turns.map((turn) => turn.id)).size).toBe(1);
		expect(turns.at(-1)?.status).toBe("completed");
		expect(sessionsOf(events).at(-1)?.status).toBe("idle");

		await adapter.dispose();
	});

	it("does not steer an agent that does not advertise it", async () => {
		const agent = new FakeAcpAgent();
		agent.protocolVersion = 1;
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
		agent.protocolVersion = 1;
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
			.filter((e) => e.type === "item")
			.map((e) => (e.type === "item" ? e.turnId : ""));
		expect(itemTurnIds.length).toBeGreaterThan(0);
		expect(itemTurnIds.every((id) => id.length > 0)).toBe(true);

		await adapter.dispose();
	});

	it("v2 resume replays with session/resume", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent, "sess-1");
		await flush(40);

		expect(agent.sent.map((f) => f.method)).toEqual([
			"initialize",
			"session/resume",
		]);
		expect(agent.sent[1]?.params).toEqual({
			sessionId: "sess-1",
			cwd: "/work",
			mcpServers: [],
			replayFrom: { type: "start" },
		});
		expect(
			itemsOf(events)
				.filter((item) => item.kind === "agent_message")
				.map(textOf)
				.filter(Boolean),
		).toEqual(["On it.", "Shipped."]);
		expect(sessionsOf(events).at(-1)?.harnessSessionId).toBe("sess-1");

		await adapter.dispose();
	});

	it("v2 resume falls back to a new session when not found", async () => {
		const agent = new FakeAcpAgent();
		agent.loadFails = true;
		const { adapter, events } = startAdapter(agent, "sess-1");
		await flush(40);

		expect(agent.sent.map((f) => f.method)).toEqual([
			"initialize",
			"session/resume",
			"session/new",
		]);
		expect(sessionsOf(events).map((s) => s.status)).not.toContain("dead");
		expect(sessionsOf(events).at(-1)?.status).toBe("idle");

		await adapter.dispose();
	});

	it("resumes a v1 session via session/load", async () => {
		const agent = new FakeAcpAgent();
		agent.protocolVersion = 1;
		const { adapter } = startAdapter(agent, "sess-1");
		await flush(40);

		expect(agent.sent.map((f) => f.method)).toEqual([
			"initialize",
			"session/load",
		]);
		expect(agent.sent[1]?.params).toEqual({
			sessionId: "sess-1",
			cwd: "/work",
			mcpServers: [],
		});

		await adapter.dispose();
	});

	it("reads a v2 agent's name from info", async () => {
		const agent = new FakeAcpAgent();
		agent.agentName = "paradev";
		agent.agentInfoField = "info";
		const { adapter } = startAdapter(agent);
		await flush();

		expect((adapter as unknown as { agentName: string | null }).agentName).toBe(
			"paradev",
		);

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
			.filter((e) => e.type === "item")
			.map((e) => (e.type === "item" ? e.item : null));

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
			.filter((e) => e.type === "item")
			.map((e) =>
				e.type === "item" ? { turnId: e.turnId, item: e.item } : null,
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
			.filter((e) => e.type === "turn")
			.map((e) => (e.type === "turn" ? e.turn.startedAtMs : 0));
		expect(starts.length).toBe(2);
		expect(starts[1]).toBeGreaterThan(starts[0] as number);

		await adapter.dispose();
	});

	it("opens a new session when there is no transcript to resume", async () => {
		const agent = new FakeAcpAgent();
		agent.loadFails = true;
		agent.protocolVersion = 1;
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
			.filter((e) => e.type === "session")
			.map((e) => (e.type === "session" ? e.session.status : null));
		expect(statuses).toContain("idle");
		expect(statuses).not.toContain("dead");

		// The caller asked for sess-1 and did not get it; it has to be told which
		// session the chat actually ended up on, or its stored id stays dead.
		const bound = events
			.filter((e) => e.type === "session")
			.map((e) =>
				e.type === "session" ? e.session.harnessSessionId : undefined,
			)
			.filter((id) => id !== undefined)
			.pop();
		expect(bound).toBe("sess-1");

		// Quietly: an error the reader cannot act on is worse than a plain note.
		const notice = events
			.filter((e) => e.type === "item")
			.map((e) => (e.type === "item" ? e.item : null))
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
				.filter((e) => e.type === "session")
				.map((e) => (e.type === "session" ? e.session.status : null));
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

	it("forks at a message only for an agent known to honour the cut, and resumes it quietly", async () => {
		const cutting = new FakeAcpAgent();
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => cutting.transport(handlers),
			now: () => 1,
			mintId: () => "x",
			forkAtMessage: true,
		});
		void collect(adapter.start({ cwd: "/work" }), []);
		await flush(40);
		expect(await adapter.fork({ upToMessageId: "msg_1" })).toBe("sess-forked");
		const forkFrame = cutting.sent.find((f) => f.method === "session/fork");
		expect(
			(forkFrame?.params as { _meta?: unknown } | undefined)?._meta,
		).toEqual({
			jetbrains: { air: { fork: { version: 1, messageId: "msg_1" } } },
		});
		await adapter.dispose();

		const ignoring = new FakeAcpAgent();
		const unsure = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => ignoring.transport(handlers),
			now: () => 1,
			mintId: () => "x",
		});
		void collect(unsure.start({ cwd: "/work" }), []);
		await flush(40);
		expect(await unsure.fork({ upToMessageId: "msg_1" })).toBeNull();
		expect(ignoring.sent.map((f) => f.method)).not.toContain("session/fork");
		await unsure.dispose();

		const replayed = new FakeAcpAgent();
		replayed.replayUpdates = [
			{
				sessionUpdate: "agent_message_chunk",
				messageId: "msg_1",
				content: { type: "text", text: "earlier reply" },
			},
			{
				sessionUpdate: "agent_message_chunk",
				messageId: "msg_1",
				content: { type: "text", text: ", continued" },
			},
		];
		const quiet = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => replayed.transport(handlers),
			now: () => 1,
			mintId: () => "x",
		});
		const quietEvents: AdapterEvent[] = [];
		void collect(
			quiet.start({
				cwd: "/work",
				resume: { harnessSessionId: "sess-forked", quiet: true },
			}),
			quietEvents,
		);
		await flush(40);
		expect(replayed.sent.map((f) => f.method)).toContain("session/resume");
		expect(itemsOf(quietEvents)).toEqual([]);
		expect(quietEvents.filter((event) => event.type === "delta")).toEqual([]);
		await quiet.dispose();
	});

	it("keeps the agent's id on the messages it streams", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "hi" }]);
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "agent_message_chunk",
			messageId: "msg_7",
			content: { type: "text", text: "hello" },
		});
		await flush();
		expect(
			itemsOf(events).find((item) => item.id.endsWith(":msg_7")),
		).toMatchObject({ agentMessageId: "msg_7" });
		await adapter.dispose();
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
						{
							name: "compact",
							description: "Compact the context",
							_meta: { command_category: "native" },
						},
						{
							name: "mcp:search",
							description: "Search",
							_meta: { command_category: "unknown" },
						},
						{ name: "", description: "dropped: no name" },
					],
				},
			},
		});
		await flush();

		const sessions = events
			.filter((e) => e.type === "session")
			.map((e) => (e.type === "session" ? e.session : null));
		const commands = sessions
			.map((s) => s?.availableCommands)
			.filter((c) => c !== undefined)
			.pop();
		expect(commands).toEqual([
			{ name: "review", description: "Review the diff" },
			{
				name: "compact",
				description: "Compact the context",
				category: "native",
			},
			{ name: "mcp:search", description: "Search" },
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
			.filter((e) => e.type === "item")
			.map((e) => (e.type === "item" ? e.item : null))
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
			.filter((e) => e.type === "item")
			.map((e) => (e.type === "item" ? e.item : null))
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

	it("advertises form elicitation and answers a question form", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		const initialize = agent.sent.find((f) => f.method === "initialize");
		expect(initialize?.params).toMatchObject({
			clientCapabilities: { elicitation: { form: {} } },
			capabilities: { elicitation: { form: {} } },
		});

		const requestId = agent.requestElicitation({
			toolCallId: "tc-ask",
			message: "Which database?",
			requestedSchema: {
				type: "object",
				properties: {
					question_0: {
						type: "string",
						title: "Database",
						oneOf: [
							{ const: "Postgres", title: "Postgres", description: "SQL" },
							{ const: "Redis", title: "Redis" },
						],
					},
					question_0_custom: { type: "string", title: "Other" },
				},
			},
		});
		await flush();

		const approval = itemsOf(events).find((i) => i.kind === "approval_request");
		expect(approval).toMatchObject({
			targetItemId: "tc-ask",
			form: {
				message: "Which database?",
				fields: [
					{
						id: "question_0",
						title: "Database",
						input: "single",
						options: [
							{ value: "Postgres", label: "Postgres", description: "SQL" },
							{ value: "Redis", label: "Redis" },
						],
					},
					{ id: "question_0_custom", title: "Other", input: "text" },
				],
			},
		});

		adapter.respondToApproval(approval?.id ?? "", {
			type: "form",
			values: { question_0: "Redis" },
		});
		await flush();

		expect(agent.responseTo(requestId)?.result).toEqual({
			action: "accept",
			content: { question_0: "Redis" },
		});

		await adapter.dispose();
	});

	it("types a generic form's answers by its schema", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		const requestId = agent.requestElicitation({
			message: "Configure",
			requestedSchema: {
				type: "object",
				required: ["confirm"],
				properties: {
					confirm: { type: "boolean", title: "Confirm" },
					count: { type: "integer" },
					ratio: { type: "number" },
					size: {
						type: "string",
						enum: ["s", "l"],
						enumNames: ["Small", "Large"],
					},
				},
			},
		});
		await flush();

		const approval = itemsOf(events).find((i) => i.kind === "approval_request");
		expect(approval).toMatchObject({
			targetItemId: null,
			form: {
				fields: [
					{ id: "confirm", input: "boolean", required: true },
					{ id: "count", input: "integer" },
					{ id: "ratio", input: "number" },
					{
						id: "size",
						input: "single",
						options: [
							{ value: "s", label: "Small" },
							{ value: "l", label: "Large" },
						],
					},
				],
			},
		});

		adapter.respondToApproval(approval?.id ?? "", {
			type: "form",
			values: { confirm: "true", count: "3", ratio: "2.5", size: "l" },
		});
		await flush();

		expect(agent.responseTo(requestId)?.result).toEqual({
			action: "accept",
			content: { confirm: true, count: 3, ratio: 2.5, size: "l" },
		});

		await adapter.dispose();
	});

	it("keeps a form pending when an answer misses a required field or is not a whole number", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		const requestId = agent.requestElicitation({
			message: "Configure",
			requestedSchema: {
				type: "object",
				required: ["confirm"],
				properties: {
					confirm: { type: "boolean" },
					count: { type: "integer" },
				},
			},
		});
		await flush();
		const approvalId =
			itemsOf(events).find((i) => i.kind === "approval_request")?.id ?? "";

		adapter.respondToApproval(approvalId, {
			type: "form",
			values: { count: "3" },
		});
		adapter.respondToApproval(approvalId, {
			type: "form",
			values: { confirm: "true", count: "3.9" },
		});
		await flush();
		expect(agent.responseTo(requestId)).toBeUndefined();

		adapter.respondToApproval(approvalId, {
			type: "form",
			values: { confirm: "false", count: "4" },
		});
		await flush();
		expect(agent.responseTo(requestId)?.result).toEqual({
			action: "accept",
			content: { confirm: false, count: 4 },
		});

		await adapter.dispose();
	});

	it("answers a form with decline for an allow and cancel for a cancel", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		const allowId = agent.requestElicitation({ message: "First" }, 9002);
		const cancelId = agent.requestElicitation({ message: "Second" }, 9003);
		await flush();

		const [first, second] = itemsOf(events).filter(
			(i) => i.kind === "approval_request",
		);
		adapter.respondToApproval(first?.id ?? "", { type: "accept" });
		adapter.respondToApproval(second?.id ?? "", { type: "cancel" });
		await flush();

		expect(agent.responseTo(allowId)?.result).toEqual({ action: "decline" });
		expect(agent.responseTo(cancelId)?.result).toEqual({ action: "cancel" });

		await adapter.dispose();
	});

	it("rejects a url-mode or malformed elicitation", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		const urlId = agent.requestElicitation(
			{ mode: "url", message: "Sign in", url: "https://example.com" },
			9002,
		);
		const malformedId = agent.requestElicitation({}, 9003);
		await flush();

		expect(agent.responseTo(urlId)?.error).toMatchObject({ code: -32602 });
		expect(agent.responseTo(malformedId)?.error).toMatchObject({
			code: -32602,
		});
		expect(
			itemsOf(events).some((i) => i.kind === "approval_request"),
		).toBeFalse();

		await adapter.dispose();
	});

	it("does not allow a permission request on a form decision", async () => {
		const agent = new FakeAcpAgent();
		const { adapter } = startAdapter(agent);
		await flush();

		agent.requestPermission("sess-1", "tc-1");
		await flush();
		adapter.respondToApproval("approval:tc-1", { type: "form", values: {} });
		await flush();

		expect(agent.lastPermissionResponse()?.result).toEqual({
			outcome: { outcome: "cancelled" },
		});

		await adapter.dispose();
	});

	it("cancels a turn's pending form when the turn ends", async () => {
		const agent = new FakeAcpAgent();
		agent.holdPrompts = true;
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "ask me" }]);
		await flush();

		const requestId = agent.requestElicitation({ message: "Which?" });
		await flush();
		agent.releasePrompts("cancelled");
		await flush();

		const approvals = itemsOf(events).filter(
			(i) => i.kind === "approval_request",
		);
		expect(approvals.at(-1)).toMatchObject({ status: "stale" });
		expect(agent.responseTo(requestId)?.result).toEqual({ action: "cancel" });

		await adapter.dispose();
	});

	it("marks a form stale when the agent cancels its request", async () => {
		const agent = new FakeAcpAgent();
		agent.holdPrompts = true;
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "ask me" }]);
		await flush();

		const requestId = agent.requestElicitation({ message: "Which?" });
		await flush();
		agent.cancelRequest(requestId);
		await flush();

		const approvals = itemsOf(events).filter(
			(i) => i.kind === "approval_request",
		);
		expect(approvals.at(-1)).toMatchObject({ status: "stale" });
		const statuses = events.flatMap((e) =>
			e.type === "session" && e.session.status ? [e.session.status] : [],
		);
		expect(statuses.at(-1)).toBe("running");

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

	it("names the MCP server and tool of a Claude MCP call, and keeps them across updates", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-mcp",
			title: "mcp__linear__save_issue",
			kind: "other",
			_meta: { claudeCode: { toolName: "mcp__linear__save_issue" } },
		});
		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-mcp",
			status: "completed",
		});
		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-bash",
			title: "ls",
			kind: "execute",
			_meta: { claudeCode: { toolName: "Bash" } },
		});
		await flush();

		const toolCalls = itemsOf(events).filter((i) => i.kind === "tool_call");
		const mcpCalls = toolCalls.filter((i) => i.id === "tc-mcp");
		const last = mcpCalls[mcpCalls.length - 1];
		expect(last && "mcpServer" in last ? last.mcpServer : null).toEqual({
			name: "linear",
			tool: "save_issue",
		});
		expect(last && "toolName" in last ? last.toolName : "").toBe(
			"mcp__linear__save_issue",
		);
		const bash = toolCalls.find((i) => i.id === "tc-bash");
		expect(bash && "mcpServer" in bash ? bash.mcpServer : undefined).toBe(
			undefined,
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

	it("v2 insertion response keeps the turn open until idle", async () => {
		const agent = new FakeAcpAgent();
		agent.insertOnPrompt = true;
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "hi" }]);
		await flush();
		const lastTurn = () =>
			events.flatMap((e) => (e.type === "turn" ? [e.turn] : [])).at(-1);

		expect(lastTurn()?.status).toBe("running");
		expect(sessionsOf(events).at(-1)?.status).toBe("running");

		agent.notify("sess-1", { sessionUpdate: "state_update", state: "running" });
		agent.notify("sess-1", {
			sessionUpdate: "state_update",
			state: "requires_action",
		});
		agent.notify("sess-1", { sessionUpdate: "state_update", state: "running" });
		await flush();
		expect(lastTurn()?.status).toBe("running");

		agent.notify("sess-1", {
			sessionUpdate: "state_update",
			state: "idle",
			stopReason: "end_turn",
		});
		await flush();
		expect(lastTurn()?.status).toBe("completed");
		expect(sessionsOf(events).at(-1)?.status).toBe("idle");

		await adapter.dispose();
	});

	it("v2 idle cancelled interrupts the turn", async () => {
		const agent = new FakeAcpAgent();
		agent.insertOnPrompt = true;
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "hi" }]);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "state_update",
			state: "idle",
			stopReason: "cancelled",
		});
		await flush();
		const turn = events
			.flatMap((e) => (e.type === "turn" ? [e.turn] : []))
			.at(-1);
		expect(turn?.status).toBe("interrupted");

		await adapter.dispose();
	});

	it("v2 idle error fails the turn", async () => {
		const agent = new FakeAcpAgent();
		agent.insertOnPrompt = true;
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "hi" }]);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "state_update",
			state: "idle",
			stopReason: "error",
			error: { message: "provider overloaded" },
		});
		await flush();
		const turn = events
			.flatMap((e) => (e.type === "turn" ? [e.turn] : []))
			.at(-1);
		expect(turn?.status).toBe("failed");
		expect(turn?.error?.message).toBe("provider overloaded");
		expect(sessionsOf(events).at(-1)?.status).toBe("idle");

		await adapter.dispose();
	});

	it("a v2 response with stopReason still ends the turn", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "hi" }]);
		await flush();

		const turn = events
			.flatMap((e) => (e.type === "turn" ? [e.turn] : []))
			.at(-1);
		expect(turn?.status).toBe("completed");

		await adapter.dispose();
	});

	it("an idle with no turn of ours only sets the session idle", async () => {
		const agent = new FakeAcpAgent();
		agent.insertOnPrompt = true;
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "hi" }]);
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "state_update",
			state: "idle",
			stopReason: "end_turn",
		});
		await flush();
		const turnEvents = () => events.filter((e) => e.type === "turn").length;
		const before = turnEvents();

		agent.notify("sess-1", { sessionUpdate: "state_update", state: "running" });
		agent.notify("sess-1", {
			sessionUpdate: "agent_message",
			messageId: "a9",
			content: [{ type: "text", text: "Helper finished." }],
		});
		agent.notify("sess-1", {
			sessionUpdate: "state_update",
			state: "idle",
			stopReason: "end_turn",
		});
		await flush();

		expect(turnEvents()).toBe(before);
		expect(sessionsOf(events).at(-1)?.status).toBe("idle");
		expect(textOf(itemsOf(events).at(-1))).toBe("Helper finished.");

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

	const v2Permission = {
		title: "Allow Bash: sleep 6?",
		description: "sleep 6",
		subject: {
			type: "tool_call",
			toolCall: { toolCallId: "pi-ui-7", title: "Allow Bash: sleep 6?" },
		},
		options: [
			{ optionId: "choice-0", name: "Allow once", kind: "allow_once" },
			{ optionId: "choice-1", name: "Deny", kind: "allow_once" },
		],
	};

	it("a v2 permission shows its top-level title", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(
			agent,
			undefined,
			{},
			{ defaultModeId: "default", clientApprovalModes: true },
		);
		await flush();
		adapter.prompt([{ type: "text", text: "run" }]);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "state_update",
			state: "requires_action",
		});
		agent.requestPermissionWith(v2Permission, 9301);
		await flush();

		const approval = itemsOf(events).find(
			(item) => item.kind === "approval_request",
		);
		expect(approval).toMatchObject({
			title: "Allow Bash: sleep 6?",
			detail: [{ type: "text", text: "sleep 6" }],
			status: "pending",
		});
		expect(sessionsOf(events).at(-1)?.status).toBe("awaiting_input");

		await adapter.dispose();
	});

	it("a v2 permission with a null title falls back to its tool call title", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(
			agent,
			undefined,
			{},
			{ defaultModeId: "default", clientApprovalModes: true },
		);
		await flush();
		adapter.prompt([{ type: "text", text: "run" }]);
		await flush();

		agent.requestPermissionWith({ ...v2Permission, title: null }, 9303);
		await flush();

		expect(
			itemsOf(events).find((item) => item.kind === "approval_request"),
		).toMatchObject({ title: "Allow Bash: sleep 6?", status: "pending" });

		await adapter.dispose();
	});

	it("a v2 permission with null description and subject still asks", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(
			agent,
			undefined,
			{},
			{ defaultModeId: "default", clientApprovalModes: true },
		);
		await flush();
		adapter.prompt([{ type: "text", text: "run" }]);
		await flush();

		agent.requestPermissionWith(
			{ ...v2Permission, description: null, subject: null },
			9304,
		);
		agent.requestPermissionWith(
			{ ...v2Permission, subject: { toolCall: { title: null } } },
			9305,
		);
		await flush();

		expect(
			itemsOf(events).filter((item) => item.kind === "approval_request"),
		).toHaveLength(2);

		await adapter.dispose();
	});

	it("a v2 permission is auto-approved in an auto-approving mode", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(
			agent,
			undefined,
			{},
			{ defaultModeId: "bypassPermissions", clientApprovalModes: true },
		);
		await flush();
		adapter.prompt([{ type: "text", text: "run" }]);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "state_update",
			state: "requires_action",
		});
		agent.requestPermissionWith(v2Permission, 9302);
		agent.notify("sess-1", { sessionUpdate: "state_update", state: "running" });
		await flush();

		expect(agent.sent.find((f) => f.id === 9302)?.result).toEqual({
			outcome: { outcome: "selected", optionId: "choice-0" },
		});
		expect(
			itemsOf(events).some((item) => item.kind === "approval_request"),
		).toBe(false);
		expect(sessionsOf(events).map((s) => s.status)).not.toContain(
			"awaiting_input",
		);

		await adapter.dispose();
	});

	it("offers its own approval modes, answers permissions silently by them, and asks questions as forms", async () => {
		const agent = new FakeAcpAgent();
		agent.protocolVersion = 1;
		agent.newSessionModes = {
			currentModeId: "medium",
			availableModes: [
				{ id: "low", name: "Thinking: low" },
				{ id: "medium", name: "Thinking: medium" },
			],
		};
		const { adapter, events } = startAdapter(
			agent,
			undefined,
			{},
			{ defaultModeId: "bypassPermissions", clientApprovalModes: true },
		);
		await flush();
		adapter.setMode("medium");
		expect(sessionsOf(events).at(-1)?.modeId).toBe("bypassPermissions");
		expect(sessionsOf(events).find((s) => s.availableModes)).toMatchObject({
			modeId: "bypassPermissions",
			availableModes: [
				{ id: "default" },
				{ id: "auto" },
				{ id: "bypassPermissions" },
			],
		});
		adapter.prompt([{ type: "text", text: "run" }]);
		await flush();

		agent.requestPdevPermission("tc-1", 9101);
		await flush();
		expect(agent.sent.find((f) => f.id === 9101)?.result).toEqual({
			outcome: { outcome: "selected", optionId: "choice-0" },
		});
		expect(itemsOf(events).some((item) => item.id === "approval:tc-1")).toBe(
			false,
		);

		agent.askQuestion("sess-1", "q-1");
		await flush();
		expect(
			itemsOf(events).find((item) => item.id === "approval:q-1"),
		).toMatchObject({
			status: "pending",
			form: {
				message: "Which color?",
				fields: [
					{
						title: "Color",
						input: "single",
						options: [
							{ value: "choice-0", label: "Red" },
							{ value: "choice-1", label: "Blue" },
						],
					},
					{ id: "answer_custom", title: "Other", input: "text" },
				],
			},
		});
		adapter.respondToApproval("approval:q-1", {
			type: "form",
			values: { answer: "choice-1" },
		});
		await flush();
		expect(agent.sent.find((f) => f.id === 9003)?.result).toEqual({
			outcome: { outcome: "selected", optionId: "choice-1" },
		});

		adapter.setMode("default");
		agent.requestPdevPermission("tc-2", 9102);
		await flush();
		expect(
			itemsOf(events)
				.filter((item) => item.id === "approval:tc-2")
				.at(-1),
		).toMatchObject({
			status: "pending",
			options: [
				{ optionId: "choice-0", kind: "allow_once" },
				{ optionId: "choice-1", kind: "allow_always" },
				{ optionId: "choice-2", kind: "reject_once" },
			],
		});

		adapter.setMode("auto");
		await flush();
		expect(
			itemsOf(events)
				.filter((item) => item.id === "approval:tc-2")
				.at(-1),
		).toMatchObject({ status: "answered" });
		expect(agent.sent.find((f) => f.id === 9102)?.result).toEqual({
			outcome: { outcome: "selected", optionId: "choice-0" },
		});
		expect(agent.sent.some((f) => f.method === "session/set_mode")).toBe(false);

		await adapter.dispose();
	});

	it("keeps its own approval modes over an agent's mode config option", async () => {
		const agent = new FakeAcpAgent();
		agent.newSessionConfigOptions = [
			{
				configId: "mode",
				name: "Mode",
				type: "select",
				category: "mode",
				currentValue: "medium",
				options: [
					{ value: "low", name: "Thinking: low" },
					{ value: "medium", name: "Thinking: medium" },
				],
			},
		];
		const { adapter, events } = startAdapter(
			agent,
			undefined,
			{},
			{ defaultModeId: "bypassPermissions", clientApprovalModes: true },
		);
		await flush();

		const withModes = sessionsOf(events).filter((s) => s.availableModes);
		expect(withModes.at(-1)?.availableModes?.map((mode) => mode.id)).toEqual([
			"default",
			"auto",
			"bypassPermissions",
		]);
		expect(
			sessionsOf(events)
				.filter((s) => s.modeId)
				.at(-1)?.modeId,
		).toBe("bypassPermissions");
		expect(
			agent.sent.some((f) => f.method === "session/set_config_option"),
		).toBe(false);

		await adapter.dispose();
	});

	it("asks a question with Allow and Deny choices while ask_user_question runs", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(
			agent,
			undefined,
			{},
			{ defaultModeId: "bypassPermissions", clientApprovalModes: true },
		);
		await flush();
		adapter.prompt([{ type: "text", text: "run" }]);
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "tool_call",
			toolCallId: "ask",
			title: "ask_user_question",
			status: "pending",
		});
		agent.requestPermissionWith(
			{
				toolCall: { toolCallId: "q-1", title: "Allow network access?" },
				options: [
					{ optionId: "choice-0", name: "Allow", kind: "allow_once" },
					{ optionId: "choice-1", name: "Deny", kind: "allow_once" },
				],
			},
			9201,
		);
		await flush();

		expect(
			itemsOf(events).find((item) => item.id === "approval:q-1"),
		).toMatchObject({
			status: "pending",
			form: { fields: [{ input: "single" }] },
		});
		expect(agent.sent.some((f) => f.id === 9201)).toBe(false);

		await adapter.dispose();
	});

	it("answers a typed question with pi's Other choice and sends the text once the turn ends", async () => {
		const agent = new FakeAcpAgent();
		agent.holdPrompts = true;
		const { adapter } = startAdapter(
			agent,
			undefined,
			{},
			{ defaultModeId: "bypassPermissions", clientApprovalModes: true },
		);
		await flush();
		adapter.prompt([{ type: "text", text: "run" }]);
		await flush();
		agent.askQuestion("sess-1", "q-1");
		await flush();

		adapter.respondToApproval("approval:q-1", {
			type: "form",
			values: { answer_custom: "purple" },
		});
		await flush();
		expect(agent.sent.find((f) => f.id === 9003)?.result).toEqual({
			outcome: { outcome: "selected", optionId: "choice-2" },
		});
		const prompts = () =>
			agent.sent.filter((f) => f.method === "session/prompt");
		expect(prompts()).toHaveLength(1);

		agent.releasePrompts("end_turn");
		await flush();
		expect(prompts().at(-1)?.params).toMatchObject({
			prompt: [{ type: "text", text: "purple" }],
		});

		await adapter.dispose();
	});

	it("resumes a session with its own approval modes in Ask, not the harness default", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(
			agent,
			"sess-1",
			{},
			{ defaultModeId: "bypassPermissions", clientApprovalModes: true },
		);
		await flush(40);

		expect(
			sessionsOf(events)
				.filter((s) => s.availableModes)
				.at(-1)?.modeId,
		).toBe("default");

		await adapter.dispose();
	});

	it("names the selected model on a live agent message", async () => {
		const agent = new FakeAcpAgent();
		agent.newSessionConfigOptions = [
			{
				configId: "model",
				name: "Model",
				type: "select",
				category: "model",
				currentValue: "pdev/auto",
				options: [{ value: "pdev/auto", name: "pdev/Auto" }],
			},
		];
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "hi" }]);
		await flush();

		expect(
			itemsOf(events)
				.filter((item) => item.kind === "agent_message")
				.at(-1),
		).toMatchObject({ model: "pdev/Auto" });

		await adapter.dispose();
	});

	it("shows the model pdev resolved, not the alias, on a live message", async () => {
		const agent = new FakeAcpAgent();
		agent.agentName = "paradev";
		agent.chunkMeta = {
			piAcp: {
				model: { provider: "vercel-ai-gateway", modelId: "zai/glm-5.3-flash" },
			},
		};
		agent.newSessionConfigOptions = [
			{
				configId: "model",
				name: "Model",
				type: "select",
				category: "model",
				currentValue: "pdev/auto",
				options: [{ value: "pdev/auto", name: "pdev/Auto" }],
			},
		];
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "hi" }]);
		await flush();

		expect(
			itemsOf(events)
				.filter((item) => item.kind === "agent_message")
				.at(-1),
		).toMatchObject({ model: "zai/glm-5.3-flash" });

		await adapter.dispose();
	});

	it("strips the gateway prefix from the model id pdev reports", async () => {
		const agent = new FakeAcpAgent();
		agent.chunkMeta = {
			piAcp: { model: "vercel-ai-gateway/zai/glm-5.3-flash" },
		};
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "hi" }]);
		await flush();

		expect(
			itemsOf(events)
				.filter((item) => item.kind === "agent_message")
				.at(-1),
		).toMatchObject({ model: "zai/glm-5.3-flash" });

		await adapter.dispose();
	});

	it("drops the pdev/ prefix from pdev's labels and never names a message after the Auto alias", async () => {
		const agent = new FakeAcpAgent();
		agent.agentName = "paradev";
		agent.newSessionConfigOptions = [
			{
				configId: "model",
				name: "Model",
				type: "select",
				category: "model",
				currentValue: "pdev/auto",
				options: [{ value: "pdev/auto", name: "pdev/Auto" }],
			},
		];
		const { adapter, events } = startAdapter(agent);
		await flush();

		const session = sessionsOf(events)
			.filter((s) => s.configOptions)
			.at(-1);
		const model = session?.configOptions?.find(
			(option) => option.category === "model",
		);
		expect(model?.options[0]).toMatchObject({ label: "Auto" });

		adapter.prompt([{ type: "text", text: "hi" }]);
		await flush();
		const message = itemsOf(events)
			.filter((item) => item.kind === "agent_message")
			.at(-1);
		expect(message?.kind === "agent_message" && message.model).toBeFalsy();

		await adapter.dispose();
	});

	it("keeps pdev notifications out of the transcript, except errors", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "agent_message",
			messageId: "n1",
			content: [{ type: "text", text: "MCP servers need attention" }],
			_meta: { piAcp: { notify: { level: "warning" } } },
		});
		agent.notify("sess-1", {
			sessionUpdate: "agent_message",
			messageId: "n2",
			content: [{ type: "text", text: "extension crashed" }],
			_meta: { piAcp: { notify: { level: "error" } } },
		});
		await flush();
		const items = itemsOf(events);
		expect(items.some((item) => item.kind === "agent_message")).toBe(false);
		expect(
			items.filter((item) => item.kind === "notice").map((item) => item.text),
		).toEqual(["extension crashed"]);
		await adapter.dispose();
	});

	it("keeps the model a replayed v2 message reports", async () => {
		const agent = new FakeAcpAgent();
		agent.replayUpdates = [
			{
				sessionUpdate: "agent_message",
				messageId: "a1",
				content: [{ type: "text", text: "On it." }],
				_meta: { piAcp: { model: "zai/glm-5.3-flash" } },
			},
		];
		const { adapter, events } = startAdapter(agent, "sess-1");
		await flush();

		expect(
			itemsOf(events)
				.filter((item) => item.kind === "agent_message")
				.at(-1),
		).toMatchObject({ model: "zai/glm-5.3-flash" });

		await adapter.dispose();
	});

	it("lists a pi background shell from its tool result until pi reports it stopped", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "run" }]);
		await flush();
		const shellTasks = () =>
			sessionsOf(events)
				.filter((session) => session.backgroundTasks)
				.at(-1)
				?.backgroundTasks?.map((task) => [task.id, task.name]);

		agent.notify("sess-1", {
			sessionUpdate: "tool_call",
			toolCallId: "bg",
			title: "bash_background",
			rawInput: { command: "sleep 25", description: "Wait a while" },
		});
		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "bg",
			status: "completed",
			rawOutput: {
				details: { shellId: "bash_1", status: "running", pid: process.pid },
			},
		});
		await flush();
		expect(shellTasks()).toEqual([["bash_1", "Wait a while"]]);

		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "kill",
			title: "kill_shell",
			status: "completed",
			rawOutput: { details: { shellId: "bash_1", status: "killed" } },
		});
		await flush();
		expect(shellTasks()).toEqual([]);

		await adapter.dispose();
	});

	it("stops a pi background shell's process and drops it once the process is gone", async () => {
		const shell = spawn("sleep", ["30"], { detached: true, stdio: "ignore" });
		const pid = shell.pid;
		if (pid === undefined) throw new Error("no pid");
		const exited = new Promise((resolve) => shell.once("exit", resolve));
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(
			agent,
			undefined,
			{},
			{ shellPollMs: 5 },
		);
		await flush();
		adapter.prompt([{ type: "text", text: "run" }]);
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "bg",
			title: "bash_background",
			status: "completed",
			rawOutput: { details: { shellId: "bash_1", status: "running", pid } },
		});
		await flush();

		expect(await adapter.stopBackgroundTask("bash_1")).toBe(true);
		await exited;
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(
			sessionsOf(events)
				.filter((session) => session.backgroundTasks)
				.at(-1)?.backgroundTasks,
		).toEqual([]);

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

	it("holds a prompt for a change made while it waits", async () => {
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
					{ value: "acceptEdits", name: "Approve edits" },
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
		adapter.setConfigOption("mode", "acceptEdits");
		await flush(16);

		const methods = () => agent.sent.map((f) => f.method);
		agent.releaseFirstSelection();
		await flush(16);
		expect(methods()).not.toContain("session/prompt");

		agent.releaseSelections();
		await flush(16);
		expect(methods()).toContain("session/prompt");

		await adapter.dispose();
	});

	it("keeps an unanswered change selected after it times out, and sends the prompt", async () => {
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
			{ defaultModeId: "bypassPermissions", requestTimeoutMs: 5 },
		);
		adapter.prompt([{ type: "text", text: "go" }]);
		await flush(16);
		expect(agent.sent.map((f) => f.method)).not.toContain("session/prompt");

		await Bun.sleep(20);
		await flush(16);
		expect(agent.sent.map((f) => f.method)).toContain("session/prompt");
		expect(
			sessionsOf(events)
				.filter((session) => session.modeId !== undefined)
				.pop()?.modeId,
		).toBe("bypassPermissions");
		expect(
			itemsOf(events).some(
				(item) => item.kind === "notice" && item.noticeKind === "error",
			),
		).toBe(true);

		await adapter.dispose();
	});

	it("drops a prompt held for an unanswered change when the turn is cancelled", async () => {
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
			{ defaultModeId: "bypassPermissions" },
		);
		adapter.prompt([{ type: "text", text: "go" }]);
		await flush(16);
		const turns = () =>
			events.flatMap((event) => (event.type === "turn" ? [event.turn] : []));
		expect(turns().pop()?.status).toBe("running");

		adapter.cancelTurn();
		agent.releaseSelections();
		await flush(16);

		const methods = agent.sent.map((f) => f.method);
		expect(methods).not.toContain("session/prompt");
		expect(methods).not.toContain("session/cancel");
		expect(turns().pop()?.status).toBe("interrupted");

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
			event.type === "session" && event.session.backgroundTasks
				? [event.session.backgroundTasks.map((task) => task.name)]
				: [],
		);
		expect(lists).toEqual([["bun run dev"], []]);

		await adapter.dispose();
	});

	it("ends a subagent's background task with the subagent", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-1",
			name: "Wait",
		});
		agent.notify("child-1", {
			sessionUpdate: "async_task_spawned",
			asyncTaskId: "task-1",
			name: "sleep 120",
			canStop: true,
		});
		agent.notify("sess-1", {
			sessionUpdate: "async_task_spawned",
			asyncTaskId: "task-2",
			name: "bun run dev",
			canStop: true,
		});
		agent.notify("sess-1", {
			sessionUpdate: "subagent_state_update",
			subagentSessionId: "child-1",
			state: "completed",
		});
		await flush();

		const lists = events.flatMap((event) =>
			event.type === "session" && event.session.backgroundTasks
				? [event.session.backgroundTasks.map((task) => task.name)]
				: [],
		);
		expect(lists.at(-1)).toEqual(["bun run dev"]);

		agent.notify("child-1", {
			sessionUpdate: "async_task_spawned",
			asyncTaskId: "task-3",
			name: "late",
			canStop: true,
		});
		await flush();
		const names = events.flatMap((event) =>
			event.type === "session" && event.session.backgroundTasks
				? event.session.backgroundTasks.map((task) => task.name)
				: [],
		);
		expect(names).not.toContain("late");

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
			event.type === "item" && event.item.kind === "agent_message"
				? [(event.item as { text: string }).text]
				: [],
		);
		expect(recorded.at(-1)).toBe("Hello there.");
		await adapter.dispose();
	});

	it("treats a steered turn as working until the steered reply streams", async () => {
		const agent = new FakeAcpAgent();
		agent.protocolVersion = 1;
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

	it("shows a subagent from its spawn until its state ends, nesting its session under its tool call", async () => {
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
		const nested = toolCalls.find((i) => i.id === "sub:child-1:bash-1");
		expect(nested).toMatchObject({
			parentItemId: "subagent:child-1",
			title: "find . | wc -l",
			toolKind: "execute",
		});
		expect(toolCalls.at(-1)).toMatchObject({
			title: "Count files",
			subagent: true,
			status: "completed",
		});
		const lists = events.flatMap((event) =>
			event.type === "session" && event.session.backgroundTasks
				? [
						event.session.backgroundTasks.map(
							(task) => `${task.kind}:${task.name}`,
						),
					]
				: [],
		);
		expect(lists).toEqual([["subagent:Count files"], []]);
		const steps = events.flatMap((event) =>
			event.type === "delta" && event.delta.type === "background"
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

	it("a subagent starting its own subagent leaves the main message whole", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-1",
			name: "Outer",
		});
		agent.notify("sess-1", {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "Hello " },
		});
		agent.notify("child-1", {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-2",
			name: "Inner",
		});
		agent.notify("sess-1", {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "world" },
		});
		await flush();
		const mainMessageIds = new Set(
			itemsOf(events)
				.filter((item) => item.kind === "agent_message" && !item.parentItemId)
				.map((item) => item.id),
		);
		expect(mainMessageIds.size).toBe(1);
		await adapter.dispose();
	});

	it("streams a subagent's messages and reasoning as nested items", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-1",
			name: "Review",
		});
		agent.notify("child-1", {
			sessionUpdate: "agent_message_chunk",
			messageId: "m1",
			content: { type: "text", text: "Looking " },
		});
		agent.notify("child-1", {
			sessionUpdate: "agent_message_chunk",
			messageId: "m1",
			content: { type: "text", text: "closer." },
		});
		await flush();

		const textDeltas = events.flatMap((event) =>
			event.type === "delta" && event.delta.type === "text"
				? [event.delta]
				: [],
		);
		expect(textDeltas).toEqual([
			{
				type: "text",
				itemId: "sub:child-1:agent_message:m1",
				append: "Looking ",
				parentItemId: "subagent:child-1",
			},
			{
				type: "text",
				itemId: "sub:child-1:agent_message:m1",
				append: "closer.",
				parentItemId: "subagent:child-1",
			},
		]);

		agent.notify("child-1", {
			sessionUpdate: "agent_thought_chunk",
			content: { type: "text", text: "hmm" },
		});
		agent.notify("sess-1", {
			sessionUpdate: "subagent_state_update",
			subagentSessionId: "child-1",
			state: "completed",
		});
		await flush();

		const messages = itemsOf(events).filter(
			(i) =>
				i.kind === "agent_message" && i.parentItemId === "subagent:child-1",
		);
		expect(messages.at(-1)).toMatchObject({
			id: "sub:child-1:agent_message:m1",
			text: "Looking closer.",
		});

		const reasoning = itemsOf(events).filter(
			(i) => i.kind === "reasoning" && i.parentItemId === "subagent:child-1",
		);
		expect(reasoning.at(-1)).toMatchObject({ text: "hmm" });
		// Finishing the subagent settles text that was still streaming.
		expect(reasoning.at(-1)?.completedAtMs).toBeDefined();

		await adapter.dispose();
	});

	it("nests a subagent's own subagent a level deeper", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-1",
			name: "Explore",
		});
		agent.notify("child-1", {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "grand-1",
			name: "Search",
			task: "Find the file",
		});
		agent.notify("grand-1", {
			sessionUpdate: "tool_call",
			toolCallId: "grep-1",
			title: "grep foo",
			kind: "search",
			status: "completed",
		});
		await flush();

		const toolCalls = itemsOf(events).filter((i) => i.kind === "tool_call");
		expect(toolCalls.find((i) => i.id === "subagent:grand-1")).toMatchObject({
			parentItemId: "subagent:child-1",
			subagent: true,
		});
		expect(toolCalls.find((i) => i.id === "sub:grand-1:grep-1")).toMatchObject({
			parentItemId: "subagent:grand-1",
			title: "grep foo",
		});

		await adapter.dispose();
	});

	it("nests a subagent's permission request under its tool call", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-1",
			name: "Run tests",
		});
		agent.notify("child-1", {
			sessionUpdate: "tool_call",
			toolCallId: "bash-1",
			title: "bun test",
			kind: "execute",
			status: "in_progress",
		});
		agent.requestSubagentPermission("child-1", "bash-1", 9101);
		await flush();

		const approvals = itemsOf(events).filter(
			(i) => i.kind === "approval_request",
		);
		expect(approvals).toHaveLength(1);
		expect(approvals[0]).toMatchObject({
			parentItemId: "subagent:child-1",
			targetItemId: "sub:child-1:bash-1",
		});

		await adapter.dispose();
	});

	it("a subagent permission without a toolCallId targets nothing", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-1",
			name: "Run tests",
		});
		agent.notify("child-1", {
			sessionUpdate: "tool_call",
			toolCallId: "bash-1",
			title: "bun test",
			kind: "execute",
			status: "in_progress",
		});
		agent.requestSubagentPermissionWithoutToolCall("child-1");
		await flush();

		const approvals = itemsOf(events).filter(
			(i) => i.kind === "approval_request",
		);
		expect(approvals).toHaveLength(1);
		expect(approvals[0]).toMatchObject({
			parentItemId: "subagent:child-1",
			targetItemId: null,
		});

		await adapter.dispose();
	});

	it("a subagent elicitation without a toolCallId targets nothing", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-1",
			name: "Run tests",
		});
		agent.requestElicitation({
			sessionId: "child-1",
			message: "Which database?",
			requestedSchema: { type: "object", properties: {} },
		});
		await flush();

		const approvals = itemsOf(events).filter(
			(i) => i.kind === "approval_request",
		);
		expect(approvals).toHaveLength(1);
		expect(approvals[0]).toMatchObject({
			parentItemId: "subagent:child-1",
			targetItemId: null,
		});

		await adapter.dispose();
	});

	it("links a subagent's background task to it as the parent", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "subagent_spawned",
			subagentSessionId: "child-1",
			name: "Wait",
		});
		agent.notify("child-1", {
			sessionUpdate: "async_task_spawned",
			asyncTaskId: "task-1",
			name: "sleep 120",
			canStop: true,
		});
		await flush();

		const tasks = events.flatMap((event) =>
			event.type === "session" && event.session.backgroundTasks
				? event.session.backgroundTasks
				: [],
		);
		expect(tasks.find((task) => task.id === "task-1")).toMatchObject({
			parentId: "subagent:child-1",
		});

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

	it("a hidden subagent control call still ends the open message", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.notify("sess-1", {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "Starting an agent." },
		});
		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "agent-1",
			status: "in_progress",
			_meta: { claudeCode: { toolName: "Agent" } },
		});
		agent.notify("sess-1", {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "It is done." },
		});
		await flush();

		const messages = new Set(
			itemsOf(events)
				.filter((item) => item.kind === "agent_message")
				.map((item) => item.id),
		);
		expect(messages.size).toBe(2);

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
			event.type === "session" && event.session.title
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

	describe("Subagent Sessions RFD", () => {
		const announce = (
			sessionId: string,
			extra: Record<string, unknown> = {},
		) => ({
			sessionUpdate: "subagent_update",
			sessionId,
			title: "explore: look around",
			description: "Look around",
			state: { state: "running" },
			capabilities: { cancel: {}, _meta: { "sh.superset": { prompt: {} } } },
			...extra,
		});
		const subagentTask = (events: AdapterEvent[], id: string) =>
			sessionsOf(events)
				.filter((session) => session.backgroundTasks)
				.at(-1)
				?.backgroundTasks?.find((task) => task.id === id);
		const subagentItem = (events: AdapterEvent[], id: string) =>
			itemsOf(events)
				.filter((item) => item.id === id)
				.at(-1);

		it("subagent_update nests under the named tool call", async () => {
			const agent = new FakeAcpAgent();
			const { adapter, events } = startAdapter(agent);
			await flush();

			agent.notify("sess-1", {
				sessionUpdate: "tool_call_update",
				toolCallId: "task-1",
				title: "task",
				status: "in_progress",
			});
			agent.notify(
				"sess-1",
				announce("child-1", {
					_meta: { "sh.superset": { toolCallId: "task-1" } },
				}),
			);
			agent.notify("child-1", {
				sessionUpdate: "tool_call_update",
				toolCallId: "task-2",
				title: "task",
				status: "in_progress",
			});
			agent.notify(
				"child-1",
				announce("child-2", {
					_meta: { "sh.superset": { toolCallId: "task-2" } },
				}),
			);
			agent.notify("child-1", announce("child-3"));
			agent.notify("sess-1", announce("child-4"));
			await flush();

			expect(subagentItem(events, "subagent:child-1")?.parentItemId).toBe(
				"task-1",
			);
			expect(subagentItem(events, "subagent:child-2")?.parentItemId).toBe(
				"sub:child-1:task-2",
			);
			expect(subagentItem(events, "subagent:child-3")?.parentItemId).toBe(
				"subagent:child-1",
			);
			expect(
				subagentItem(events, "subagent:child-4")?.parentItemId,
			).toBeUndefined();
			expect(subagentTask(events, "subagent:child-2")?.parentId).toBe(
				"subagent:child-1",
			);

			await adapter.dispose();
		});

		it("capabilities set canStop and canSteer", async () => {
			const agent = new FakeAcpAgent();
			const { adapter, events } = startAdapter(agent);
			await flush();

			agent.notify("sess-1", announce("child-1"));
			agent.notify("sess-1", {
				sessionUpdate: "subagent_update",
				sessionId: "child-2",
				title: "plain",
				state: { state: "running" },
			});
			await flush();

			expect(subagentTask(events, "subagent:child-1")).toMatchObject({
				kind: "subagent",
				canStop: true,
				canSteer: true,
			});
			expect(subagentTask(events, "subagent:child-2")).toMatchObject({
				canStop: false,
				canSteer: false,
			});

			expect(await adapter.stopBackgroundTask("subagent:child-1")).toBe(true);
			expect(
				agent.sent.find((frame) => frame.method === "session/cancel")?.params,
			).toEqual({ sessionId: "child-1" });
			expect(await adapter.stopBackgroundTask("subagent:child-2")).toBe(false);

			await adapter.dispose();
		});

		it("steerSubagent prompts the child session", async () => {
			const agent = new FakeAcpAgent();
			const { adapter, events } = startAdapter(agent);
			await flush();

			agent.notify("sess-1", announce("child-1"));
			await flush();

			expect(
				await adapter.steerSubagent("subagent:child-1", [
					{ type: "text", text: "check the tests too" },
				]),
			).toBe(true);
			const sent = agent.sent.find((frame) => frame.method === "session/prompt")
				?.params as { sessionId: string; prompt: unknown } | undefined;
			expect(sent).toEqual({
				sessionId: "child-1",
				prompt: [{ type: "text", text: "check the tests too" }],
			});
			await flush();
			expect(
				itemsOf(events).some(
					(item) => item.kind === "user_message" && !item.parentItemId,
				),
			).toBe(false);

			await adapter.dispose();
		});

		it("renders a steer echo in the child", async () => {
			const agent = new FakeAcpAgent();
			const { adapter, events } = startAdapter(agent);
			await flush();

			agent.notify("sess-1", announce("child-1"));
			agent.notify("child-1", {
				sessionUpdate: "user_message",
				messageId: "steer-1",
				content: [{ type: "text", text: "check the tests too" }],
			});
			await flush();

			expect(
				subagentItem(events, "sub:child-1:user_message:steer-1"),
			).toMatchObject({
				kind: "user_message",
				parentItemId: "subagent:child-1",
				content: [{ type: "text", text: "check the tests too" }],
			});
			expect(
				itemsOf(events).some(
					(item) => item.kind === "user_message" && !item.parentItemId,
				),
			).toBe(false);

			await adapter.dispose();
		});

		it("steer on a finished subagent", async () => {
			const agent = new FakeAcpAgent();
			const { adapter } = startAdapter(agent);
			await flush();

			agent.notify("sess-1", announce("child-1"));
			agent.notify("sess-1", announce("child-2"));
			agent.notify("sess-1", {
				sessionUpdate: "subagent_update",
				sessionId: "child-1",
				state: { state: "idle", stopReason: "end_turn" },
			});
			await flush();

			const content = [{ type: "text" as const, text: "more" }];
			expect(await adapter.steerSubagent("subagent:child-1", content)).toBe(
				false,
			);
			expect(await adapter.steerSubagent("unknown", content)).toBe(false);
			expect(agent.sent.map((frame) => frame.method)).not.toContain(
				"session/prompt",
			);

			agent.finishedSubagents.add("child-2");
			expect(await adapter.steerSubagent("subagent:child-2", content)).toBe(
				false,
			);

			await adapter.dispose();
		});

		it("does not steer a subagent without the prompt capability", async () => {
			const agent = new FakeAcpAgent();
			const { adapter } = startAdapter(agent);
			await flush();

			agent.notify("sess-1", {
				sessionUpdate: "subagent_update",
				sessionId: "child-1",
				title: "plain",
				state: { state: "running" },
				capabilities: { cancel: {} },
			});
			await flush();

			expect(
				await adapter.steerSubagent("subagent:child-1", [
					{ type: "text", text: "more" },
				]),
			).toBe(false);
			expect(agent.sent.map((frame) => frame.method)).not.toContain(
				"session/prompt",
			);

			await adapter.dispose();
		});

		it("stopping a subagent cancels its session", async () => {
			const agent = new FakeAcpAgent();
			const { adapter } = startAdapter(agent);
			await flush();

			agent.notify("sess-1", announce("child-1"));
			await flush();

			expect(await adapter.stopBackgroundTask("subagent:child-1")).toBe(true);
			expect(
				agent.sent
					.filter((frame) => frame.method === "session/cancel")
					.map((frame) => frame.params),
			).toEqual([{ sessionId: "child-1" }]);

			await adapter.dispose();
		});

		const approvalOf = (events: AdapterEvent[], id: string) =>
			itemsOf(events)
				.filter((item) => item.id === id)
				.at(-1);
		const statusOf = (events: AdapterEvent[]) =>
			sessionsOf(events)
				.filter((session) => session.status)
				.at(-1)?.status;

		it("answering a subagent's approval while the main session is idle leaves it idle", async () => {
			const agent = new FakeAcpAgent();
			const { adapter, events } = startAdapter(agent);
			await flush();

			agent.notify("sess-1", announce("child-1"));
			agent.requestSubagentPermission("child-1", "bash-1", 9101);
			await flush();
			expect(statusOf(events)).toBe("awaiting_input");

			adapter.respondToApproval("approval:sub:child-1:bash-1", {
				type: "accept",
			});
			await flush();

			expect(statusOf(events)).toBe("idle");
			await adapter.dispose();
		});

		it("answering a subagent's approval during a main turn sets it running", async () => {
			const agent = new FakeAcpAgent();
			agent.holdPrompts = true;
			const { adapter, events } = startAdapter(agent);
			await flush();
			adapter.prompt([{ type: "text", text: "go" }]);
			await flush();

			agent.notify("sess-1", announce("child-1"));
			agent.requestSubagentPermission("child-1", "bash-1", 9101);
			await flush();
			adapter.respondToApproval("approval:sub:child-1:bash-1", {
				type: "accept",
			});
			await flush();

			expect(statusOf(events)).toBe("running");
			await adapter.dispose();
		});

		it("keeps a running subagent's approval open when the parent turn ends", async () => {
			const agent = new FakeAcpAgent();
			agent.holdPrompts = true;
			const { adapter, events } = startAdapter(agent);
			await flush();
			adapter.prompt([{ type: "text", text: "go" }]);
			await flush();

			agent.notify("sess-1", announce("child-1"));
			agent.requestSubagentPermission("child-1", "bash-1", 9101);
			await flush();
			agent.releasePrompts("end_turn");
			await flush();

			expect(agent.responseTo(9101)).toBeUndefined();
			expect(approvalOf(events, "approval:sub:child-1:bash-1")).toMatchObject({
				status: "pending",
			});
			expect(statusOf(events)).toBe("awaiting_input");
			await adapter.dispose();
		});

		it("stopping a subagent cancels its own and its subagents' approvals", async () => {
			const agent = new FakeAcpAgent();
			const { adapter, events } = startAdapter(agent);
			await flush();

			agent.notify("sess-1", announce("child-1"));
			agent.notify("child-1", announce("child-2"));
			agent.notify("sess-1", announce("other"));
			agent.requestSubagentPermission("child-1", "bash-1", 9101);
			agent.requestSubagentPermission("child-2", "bash-2", 9102);
			agent.requestSubagentPermission("other", "bash-3", 9103);
			await flush();

			expect(await adapter.stopBackgroundTask("subagent:child-1")).toBe(true);
			await flush();

			for (const id of [9101, 9102]) {
				expect(agent.responseTo(id)?.result).toEqual({
					outcome: { outcome: "cancelled" },
				});
			}
			expect(agent.responseTo(9103)).toBeUndefined();
			expect(approvalOf(events, "approval:sub:child-2:bash-2")).toMatchObject({
				status: "stale",
			});
			expect(statusOf(events)).toBe("awaiting_input");
			await adapter.dispose();
		});

		it("a subagent that ends answers its open approval as cancelled", async () => {
			const agent = new FakeAcpAgent();
			const { adapter, events } = startAdapter(agent);
			await flush();

			agent.notify("sess-1", {
				sessionUpdate: "subagent_spawned",
				subagentSessionId: "child-1",
				name: "Run tests",
			});
			agent.requestSubagentPermission("child-1", "bash-1", 9101);
			await flush();
			agent.notify("sess-1", {
				sessionUpdate: "subagent_state_update",
				subagentSessionId: "child-1",
				state: "completed",
			});
			await flush();

			expect(agent.responseTo(9101)?.result).toEqual({
				outcome: { outcome: "cancelled" },
			});
			expect(approvalOf(events, "approval:sub:child-1:bash-1")).toMatchObject({
				status: "stale",
			});
			expect(statusOf(events)).toBe("idle");
			await adapter.dispose();
		});

		it("clearing sh.superset turns steering off", async () => {
			const agent = new FakeAcpAgent();
			const { adapter, events } = startAdapter(agent);
			await flush();

			agent.notify("sess-1", announce("child-1"));
			agent.notify("sess-1", {
				sessionUpdate: "subagent_update",
				sessionId: "child-1",
				state: { state: "requires_action" },
				capabilities: { cancel: {}, _meta: { "sh.superset": null } },
			});
			await flush();

			expect(subagentTask(events, "subagent:child-1")).toMatchObject({
				canStop: true,
				canSteer: false,
			});
			expect(subagentItem(events, "subagent:child-1")).toMatchObject({
				status: "running",
			});

			await adapter.dispose();
		});

		it("idle error", async () => {
			const agent = new FakeAcpAgent();
			const { adapter, events } = startAdapter(agent);
			await flush();

			for (const id of ["child-1", "child-2", "child-3"])
				agent.notify("sess-1", announce(id));
			agent.notify("sess-1", {
				sessionUpdate: "subagent_update",
				sessionId: "child-1",
				state: { state: "idle", stopReason: "error" },
				capabilities: { cancel: {}, _meta: { "sh.superset": null } },
			});
			agent.notify("sess-1", {
				sessionUpdate: "subagent_update",
				sessionId: "child-2",
				state: { state: "idle", stopReason: "cancelled" },
			});
			agent.notify("sess-1", {
				sessionUpdate: "subagent_update",
				sessionId: "child-3",
				state: { state: "idle", stopReason: "end_turn" },
			});
			await flush(40);

			expect(subagentItem(events, "subagent:child-1")?.status).toBe("failed");
			expect(subagentItem(events, "subagent:child-2")?.status).toBe("canceled");
			expect(subagentItem(events, "subagent:child-3")?.status).toBe(
				"completed",
			);
			expect(subagentTask(events, "subagent:child-1")).toBeUndefined();

			await adapter.dispose();
		});

		it("session_message lands in the child", async () => {
			const agent = new FakeAcpAgent();
			const { adapter, events } = startAdapter(agent);
			await flush();

			agent.notify("sess-1", announce("child-1"));
			agent.notify("child-1", {
				sessionUpdate: "session_message",
				messageId: "subagent-task",
				senderSessionId: "sess-1",
				recipientSessionId: "child-1",
				content: [{ type: "text", text: "Look around" }],
			});
			agent.notify("child-1", {
				sessionUpdate: "session_message_chunk",
				messageId: "subagent-task",
				senderSessionId: "sess-1",
				recipientSessionId: "child-1",
				content: { type: "text", text: " carefully" },
			});
			await flush();

			const task = subagentItem(
				events,
				"sub:child-1:user_message:subagent-task",
			);
			expect(task).toMatchObject({
				kind: "user_message",
				parentItemId: "subagent:child-1",
				content: [{ type: "text", text: "Look around carefully" }],
			});

			await adapter.dispose();
		});

		it("does not render a subagent's report to its parent", async () => {
			const agent = new FakeAcpAgent();
			const { adapter, events } = startAdapter(agent);
			await flush();

			agent.notify("sess-1", announce("child-1"));
			agent.notify("child-1", {
				sessionUpdate: "agent_message",
				messageId: "a1",
				content: [{ type: "text", text: "Found it." }],
			});
			agent.notify("sess-1", {
				sessionUpdate: "subagent_update",
				sessionId: "child-1",
				state: { state: "idle", stopReason: "end_turn" },
			});
			agent.notify("child-1", {
				sessionUpdate: "session_message",
				messageId: "subagent-report",
				senderSessionId: "child-1",
				recipientSessionId: "sess-1",
				content: [{ type: "text", text: "Found it." }],
			});
			await flush();

			const childTexts = itemsOf(events).filter(
				(item) =>
					item.parentItemId === "subagent:child-1" && item.kind !== "tool_call",
			);
			expect(new Set(childTexts.map((item) => item.id))).toEqual(
				new Set(["sub:child-1:agent_message:a1"]),
			);

			await adapter.dispose();
		});

		it("keeps a child's state_update off the main session", async () => {
			const agent = new FakeAcpAgent();
			agent.holdPrompts = true;
			const { adapter, events } = startAdapter(agent);
			await flush();
			adapter.prompt([{ type: "text", text: "go" }]);
			await flush();

			agent.notify("sess-1", announce("child-1"));
			agent.notify("child-1", {
				sessionUpdate: "state_update",
				state: "idle",
				stopReason: "end_turn",
			});
			await flush();

			expect(
				sessionsOf(events)
					.filter((session) => session.status)
					.at(-1)?.status,
			).toBe("running");
			expect(
				events.some(
					(event) => event.type === "turn" && event.turn.status !== "running",
				),
			).toBe(false);
			expect(subagentItem(events, "subagent:child-1")?.status).toBe("running");

			await adapter.dispose();
		});

		it("resume clears capabilities", async () => {
			const agent = new FakeAcpAgent();
			agent.replayUpdates = [announce("child-1")];
			const { adapter, events } = startAdapter(agent, "sess-1");
			await flush(40);

			expect(subagentTask(events, "subagent:child-1")).toMatchObject({
				canStop: true,
				canSteer: false,
			});

			agent.notify("sess-1", {
				sessionUpdate: "subagent_update",
				sessionId: "child-1",
				capabilities: { cancel: {}, _meta: { "sh.superset": { prompt: {} } } },
			});
			await flush();
			expect(subagentTask(events, "subagent:child-1")?.canSteer).toBe(true);

			await adapter.dispose();
		});
		describe("resumable named subagents", () => {
			type Status = "running" | "idle" | "stopped" | "failed";
			const update = (
				sessionId: string,
				status: Status,
				options: { closed?: boolean; background?: boolean } = {},
			) => ({
				sessionUpdate: "subagent_update",
				sessionId,
				state:
					status === "running"
						? { state: "running" }
						: {
								state: "idle",
								stopReason:
									status === "stopped"
										? "cancelled"
										: status === "failed"
											? "error"
											: "end_turn",
							},
				capabilities: {
					cancel: status === "running" ? {} : null,
					_meta: {
						"sh.superset":
							status === "stopped" || options.closed
								? null
								: {
										prompt: {},
										...(options.background ? { background: {} } : {}),
									},
					},
				},
				_meta: {
					"sh.superset": {
						toolCallId: "task-1",
						name: `${sessionId}-name`,
						status,
					},
				},
			});
			const start = (sessionId: string, background = false) => ({
				...update(sessionId, "running", { background }),
				title: "explore: look around",
				description: "Look around",
			});

			it("the name titles the subagent", async () => {
				const agent = new FakeAcpAgent();
				const { adapter, events } = startAdapter(agent);
				await flush();

				agent.notify("sess-1", start("child-1"));
				await flush();

				expect(subagentItem(events, "subagent:child-1")).toMatchObject({
					title: "child-1-name",
					status: "running",
					subagentStatus: "running",
				});
				expect(subagentTask(events, "subagent:child-1")).toMatchObject({
					name: "child-1-name",
					subagentStatus: "running",
				});

				await adapter.dispose();
			});

			it("a running subagent's step is its latest child tool call", async () => {
				const agent = new FakeAcpAgent();
				const { adapter, events } = startAdapter(
					agent,
					undefined,
					{},
					{ backgroundDetailIntervalMs: 0 },
				);
				await flush();

				agent.notify("sess-1", start("child-1"));
				agent.notify("child-1", {
					sessionUpdate: "tool_call_update",
					toolCallId: "bash-1",
					name: "Bash",
					title: "sleep 10",
					kind: "execute",
					status: "in_progress",
					content: null,
					locations: null,
				});
				agent.notify("child-1", {
					sessionUpdate: "tool_call_update",
					toolCallId: "bash-1",
					status: "completed",
				});
				await flush();

				const steps = events.flatMap((event) =>
					event.type === "delta" && event.delta.type === "background"
						? [event.delta.append]
						: [],
				);
				expect(steps).toEqual(["sleep 10"]);

				await adapter.dispose();
			});

			it("an idle subagent can be steered", async () => {
				const agent = new FakeAcpAgent();
				const { adapter, events } = startAdapter(agent);
				await flush();

				agent.notify("sess-1", start("child-1"));
				agent.notify("sess-1", update("child-1", "idle"));
				await flush();

				expect(subagentItem(events, "subagent:child-1")).toMatchObject({
					status: "completed",
					subagentStatus: "idle",
					canSteer: true,
					canStop: false,
					canBackground: false,
				});
				expect(subagentTask(events, "subagent:child-1")).toBeUndefined();

				expect(
					await adapter.steerSubagent("subagent:child-1", [
						{ type: "text", text: "look at b too" },
					]),
				).toBe(true);
				expect(
					agent.sent.find((frame) => frame.method === "session/prompt")?.params,
				).toMatchObject({ sessionId: "child-1" });

				agent.notify("sess-1", update("child-1", "running"));
				agent.notify("child-1", {
					sessionUpdate: "agent_message",
					messageId: "a2",
					content: [{ type: "text", text: "Looked at b." }],
				});
				await flush();

				const item = subagentItem(events, "subagent:child-1");
				expect(item).toMatchObject({
					status: "running",
					subagentStatus: "running",
				});
				expect(item?.completedAtMs).toBeUndefined();
				expect(
					itemsOf(events).filter(
						(each) => each.kind === "tool_call" && each.subagent,
					).length,
				).toBeGreaterThan(0);
				expect(
					new Set(
						itemsOf(events)
							.filter((each) => each.kind === "tool_call" && each.subagent)
							.map((each) => each.id),
					),
				).toEqual(new Set(["subagent:child-1"]));
				expect(
					subagentItem(events, "sub:child-1:agent_message:a2"),
				).toMatchObject({
					parentItemId: "subagent:child-1",
				});
				expect(item).toMatchObject({ canStop: true, canSteer: true });
				expect(subagentTask(events, "subagent:child-1")).toMatchObject({
					canStop: true,
					canSteer: true,
					subagentStatus: "running",
				});

				await adapter.dispose();
			});

			it("an idle update without capabilities drops stop and background", async () => {
				const agent = new FakeAcpAgent();
				const { adapter, events } = startAdapter(agent);
				await flush();

				agent.notify("sess-1", start("child-1", true));
				const { capabilities: _capabilities, ...idle } = update(
					"child-1",
					"idle",
				);
				agent.notify("sess-1", idle);
				await flush();

				expect(subagentItem(events, "subagent:child-1")).toMatchObject({
					subagentStatus: "idle",
					canSteer: true,
					canStop: false,
					canBackground: false,
				});

				await adapter.dispose();
			});

			it("a replayed idle subagent is closed", async () => {
				const agent = new FakeAcpAgent();
				agent.replayUpdates = [start("child-1"), update("child-1", "idle")];
				const { adapter, events } = startAdapter(agent, "sess-1");
				await flush(40);

				expect(subagentItem(events, "subagent:child-1")).toMatchObject({
					status: "completed",
					subagentStatus: "idle",
					canSteer: false,
					canStop: false,
				});
				expect(subagentTask(events, "subagent:child-1")).toBeUndefined();
				expect(
					await adapter.steerSubagent("subagent:child-1", [
						{ type: "text", text: "more" },
					]),
				).toBe(false);

				await adapter.dispose();
			});

			it("an open idle subagent stays finished when the agent exits", async () => {
				const agent = new FakeAcpAgent();
				const { events } = startAdapter(agent);
				await flush();

				agent.notify("sess-1", start("child-1"));
				agent.notify("sess-1", update("child-1", "idle"));
				await flush();
				agent.exit(1);
				await flush();

				expect(subagentItem(events, "subagent:child-1")).toMatchObject({
					status: "completed",
					subagentStatus: "idle",
					canSteer: false,
				});
			});

			it("a subagent steer waits past the request timeout", async () => {
				jest.useFakeTimers();
				try {
					const agent = new FakeAcpAgent();
					agent.holdChildPrompts = true;
					const { adapter } = startAdapter(
						agent,
						undefined,
						{},
						{ requestTimeoutMs: 5 },
					);
					await flush();

					agent.notify("sess-1", start("child-1"));
					await flush();

					const steered = adapter.steerSubagent("subagent:child-1", [
						{ type: "text", text: "one" },
					]);
					await flush();
					jest.advanceTimersByTime(20);
					await flush();
					agent.answerChildPrompt(
						agent.heldChildPrompts[0] as number,
						"inserted",
					);

					expect(await steered).toBe(true);

					await adapter.dispose();
				} finally {
					jest.useRealTimers();
				}
			});

			it("a steer that overlaps another is credited only by its own answer", async () => {
				const agent = new FakeAcpAgent();
				agent.holdChildPrompts = true;
				const { adapter } = startAdapter(agent);
				await flush();

				agent.notify("sess-1", start("child-1"));
				await flush();

				const first = adapter.steerSubagent("subagent:child-1", [
					{ type: "text", text: "one" },
				]);
				const second = adapter.steerSubagent("subagent:child-1", [
					{ type: "text", text: "two" },
				]);
				await flush();
				const [firstId, secondId] = agent.heldChildPrompts;
				agent.notify("child-1", {
					sessionUpdate: "user_message",
					messageId: `steer-${firstId}`,
					content: [{ type: "text", text: "one" }],
				});
				agent.answerChildPrompt(firstId as number, "inserted");
				agent.answerChildPrompt(secondId as number, "rejected");

				expect(await first).toBe(true);
				expect(await second).toBe(false);

				await adapter.dispose();
			});

			it("a stopped or closed subagent cannot be steered, a failed one can", async () => {
				const agent = new FakeAcpAgent();
				const { adapter, events } = startAdapter(agent);
				await flush();

				for (const id of ["child-1", "child-2", "child-3"])
					agent.notify("sess-1", start(id));
				agent.notify("sess-1", update("child-1", "stopped"));
				agent.notify("sess-1", update("child-2", "failed"));
				agent.notify("sess-1", update("child-3", "idle", { closed: true }));
				await flush(40);

				expect(subagentItem(events, "subagent:child-1")).toMatchObject({
					status: "canceled",
					subagentStatus: "stopped",
				});
				expect(subagentItem(events, "subagent:child-2")).toMatchObject({
					status: "failed",
					subagentStatus: "failed",
				});
				expect(subagentItem(events, "subagent:child-3")).toMatchObject({
					status: "completed",
					subagentStatus: "idle",
				});
				expect(subagentItem(events, "subagent:child-2")).toMatchObject({
					canSteer: true,
					canStop: false,
				});
				for (const id of ["child-1", "child-3"])
					expect(subagentItem(events, `subagent:${id}`)).toMatchObject({
						canSteer: false,
						canStop: false,
						canBackground: false,
					});
				for (const id of ["child-1", "child-3"]) {
					expect(subagentTask(events, `subagent:${id}`)).toBeUndefined();
					expect(
						await adapter.steerSubagent(`subagent:${id}`, [
							{ type: "text", text: "more" },
						]),
					).toBe(false);
				}

				await adapter.dispose();
			});

			it("a parent message is labelled", async () => {
				const agent = new FakeAcpAgent();
				const { adapter, events } = startAdapter(agent);
				await flush();

				agent.notify("sess-1", start("child-1"));
				agent.notify("child-1", {
					sessionUpdate: "session_message",
					messageId: "subagent-message-1",
					senderSessionId: "sess-1",
					recipientSessionId: "child-1",
					content: [{ type: "text", text: "look at b too" }],
				});
				agent.notify("child-1", {
					sessionUpdate: "user_message",
					messageId: "user-1",
					content: [{ type: "text", text: "from the user" }],
				});
				agent.notify("child-1", {
					sessionUpdate: "session_message",
					messageId: "subagent-report-1",
					senderSessionId: "child-1",
					recipientSessionId: "sess-1",
					content: [{ type: "text", text: "the report" }],
				});
				await flush();

				expect(
					subagentItem(events, "sub:child-1:user_message:subagent-message-1"),
				).toMatchObject({
					kind: "user_message",
					from: "parent",
					parentItemId: "subagent:child-1",
					content: [{ type: "text", text: "look at b too" }],
				});
				const own = subagentItem(events, "sub:child-1:user_message:user-1");
				expect(own).toMatchObject({ kind: "user_message" });
				expect(own && "from" in own).toBe(false);
				expect(
					itemsOf(events).some(
						(item) => item.id === "sub:child-1:user_message:subagent-report-1",
					),
				).toBe(false);

				await adapter.dispose();
			});

			it("backgroundSubagent sends the extension request", async () => {
				const agent = new FakeAcpAgent();
				const { adapter, events } = startAdapter(agent);
				await flush();

				agent.notify("sess-1", start("child-1", true));
				agent.notify("sess-1", start("child-2"));
				await flush();

				expect(subagentTask(events, "subagent:child-1")?.canBackground).toBe(
					true,
				);
				expect(subagentTask(events, "subagent:child-2")?.canBackground).toBe(
					false,
				);
				expect(await adapter.backgroundSubagent("subagent:child-2")).toBe(
					false,
				);
				expect(await adapter.backgroundSubagent("subagent:child-1")).toBe(true);
				expect(
					agent.sent
						.filter(
							(frame) => frame.method === "_sh.superset/subagent/background",
						)
						.map((frame) => frame.params),
				).toEqual([{ sessionId: "child-1" }]);

				agent.refuseBackground = true;
				expect(await adapter.backgroundSubagent("subagent:child-1")).toBe(
					false,
				);

				agent.notify("sess-1", update("child-1", "running"));
				await flush();
				expect(subagentTask(events, "subagent:child-1")?.canBackground).toBe(
					false,
				);

				await adapter.dispose();
			});

			it("a steer that landed is not reported as finished", async () => {
				const agent = new FakeAcpAgent();
				agent.updatesBeforeSteerError = [update("child-1", "stopped")];
				const { adapter, events } = startAdapter(agent);
				await flush();

				agent.notify("sess-1", start("child-1"));
				await flush();

				expect(
					await adapter.steerSubagent("subagent:child-1", [
						{ type: "text", text: "wrap up" },
					]),
				).toBe(true);
				await flush();
				expect(subagentItem(events, "subagent:child-1")?.subagentStatus).toBe(
					"stopped",
				);

				await adapter.dispose();
			});
		});
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

	it("starts a prompt sent right after a replay after the replayed turns", async () => {
		const agent = new FakeAcpAgent();
		agent.wholeMessageReplay = true;
		const { adapter, events } = startAdapter(agent, "sess-1");
		await flush(40);
		const replayed = new Set(
			events.flatMap((e) => (e.type === "turn" ? [e.turn.id] : [])),
		);

		adapter.prompt([{ type: "text", text: "continue" }]);
		await flush(40);

		const starts = (live: boolean) =>
			events.flatMap((e) =>
				e.type === "turn" && replayed.has(e.turn.id) !== live
					? [e.turn.startedAtMs]
					: [],
			);
		expect(starts(true).length).toBeGreaterThan(0);
		expect(Math.min(...starts(true))).toBeGreaterThan(
			Math.max(...starts(false)),
		);

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
		expect(params.capabilities).toEqual({
			elicitation: { form: {} },
			_meta: AIR_CLIENT_META,
		});
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
				e.type === "item" &&
				"text" in e.item &&
				/missing\.png/.test(String(e.item.text)),
		);
		expect(told).toBe(true);
	});
});

describe("AcpAdapter images", () => {
	const PNG_HEADER = new Uint8Array(24);
	PNG_HEADER.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	new DataView(PNG_HEADER.buffer).setUint32(16, 640);
	new DataView(PNG_HEADER.buffer).setUint32(20, 480);
	const PNG_BASE64 = Buffer.from(PNG_HEADER).toString("base64");

	const startWithStore = (
		agent: FakeAcpAgent,
		storeImage: AcpAdapterOptions["storeImage"],
		resume?: { harnessSessionId: string },
	) => {
		const adapter = new AcpAdapter({
			command: "fake",
			createTransport: (_opts, handlers) => agent.transport(handlers),
			...(storeImage ? { storeImage } : {}),
			now: () => 1,
			mintId: () => "id-1",
		});
		const events: AdapterEvent[] = [];
		void collect(
			adapter.start({ cwd: "/work", ...(resume ? { resume } : {}) }),
			events,
		);
		return { adapter, events };
	};

	const lastToolCall = (events: AdapterEvent[]) => {
		const calls = itemsOf(events).filter((item) => item.kind === "tool_call");
		return calls[calls.length - 1] as
			| Extract<Item, { kind: "tool_call" }>
			| undefined;
	};

	const lastAgentMessage = (events: AdapterEvent[]) => {
		const messages = itemsOf(events).filter(
			(item) => item.kind === "agent_message",
		);
		return messages[messages.length - 1] as
			| Extract<Item, { kind: "agent_message" }>
			| undefined;
	};

	it("keeps an image a subagent sends in its own message", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startWithStore(agent, () => ({
			path: ".superset/attachments/child-shot.png",
		}));
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "subagent_update",
			sessionId: "child-1",
			title: "explore",
			state: { state: "running" },
		});
		await flush();
		agent.notify("child-1", {
			sessionUpdate: "agent_message_chunk",
			messageId: "m1",
			content: { type: "image", mimeType: "image/png", data: PNG_BASE64 },
		});
		await flush();
		const message = itemsOf(events)
			.filter(
				(item) =>
					item.kind === "agent_message" &&
					item.parentItemId === "subagent:child-1",
			)
			.at(-1) as Extract<Item, { kind: "agent_message" }> | undefined;
		expect(message?.attachments).toHaveLength(1);
		await adapter.dispose();
	});

	it("keeps an image block from a tool result as a stored attachment, never its bytes", async () => {
		const agent = new FakeAcpAgent();
		const stored: Array<{ source: AcpImageSource; cwd: string }> = [];
		const { adapter, events } = startWithStore(agent, (source, cwd) => {
			stored.push({ source, cwd });
			return { path: ".superset/attachments/shot-abc123.png" };
		});
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-img",
			title: "Read shot.png",
			kind: "read",
			status: "completed",
			content: [
				{ type: "content", content: { type: "text", text: "Read 1 image" } },
				{
					type: "content",
					content: { type: "image", data: PNG_BASE64, mimeType: "image/png" },
				},
			],
		});
		await flush();

		expect(stored).toHaveLength(1);
		expect(stored[0]?.cwd).toBe("/work");
		expect(stored[0]?.source.kind).toBe("bytes");
		const call = lastToolCall(events);
		expect(call?.content).toEqual([{ type: "text", text: "Read 1 image" }]);
		expect(call?.attachments).toEqual([
			{
				type: "image",
				path: ".superset/attachments/shot-abc123.png",
				mimeType: "image/png",
				width: 640,
				height: 480,
			},
		]);
		expect(JSON.stringify(call)).not.toContain(PNG_BASE64);

		await adapter.dispose();
	});

	it.each([
		"file:///tmp/shots/home.png",
		"file://localhost/tmp/shots/home.png",
		"/tmp/shots/home.png",
	])("keeps linked image %s across later updates", async (uri) => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startWithStore(agent, (source) =>
			source.kind === "file"
				? { path: ".superset/attachments/home-def456.png" }
				: null,
		);
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-link",
			title: "Capture home page",
			kind: "other",
			content: [
				{
					type: "content",
					content: {
						type: "resource_link",
						uri,
						name: "home.png",
						mimeType: "image/png",
					},
				},
			],
		});
		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-link",
			status: "completed",
		});
		await flush();

		const call = lastToolCall(events);
		expect(call?.status).toBe("completed");
		expect(call?.attachments).toEqual([
			{
				type: "image",
				path: ".superset/attachments/home-def456.png",
				mimeType: "image/png",
				alt: "home.png",
			},
		]);

		await adapter.dispose();
	});

	it("gives linked tool and message images stable storage references during session replay", async () => {
		const content = { type: "resource_link", uri: "file:///tmp/shot.png" };
		const updates = [
			{
				sessionUpdate: "tool_call_update",
				toolCallId: "read-1",
				content: [{ type: "content", content }],
			},
			{ sessionUpdate: "agent_message_chunk", messageId: "message-1", content },
			{
				sessionUpdate: "agent_message",
				messageId: "message-1",
				content: [content],
			},
			{ sessionUpdate: "agent_message_chunk", content },
		];
		const references: AcpImageStoreContext[] = [];
		const storeImage: NonNullable<AcpAdapterOptions["storeImage"]> = (
			_source,
			_cwd,
			context,
		) => {
			if (context) references.push(context);
			return { path: ".superset/attachments/shot.png" };
		};
		const agent = new FakeAcpAgent();
		const live = startWithStore(agent, storeImage);
		await flush();
		for (const update of updates) agent.notify("sess-1", update);
		await flush();
		await live.adapter.dispose();
		const liveReferences = references.splice(0);
		const resumedAgent = new FakeAcpAgent();
		resumedAgent.replayUpdates = updates;
		const resumed = startWithStore(resumedAgent, storeImage, {
			harnessSessionId: "sess-1",
		});
		await flush();
		expect(liveReferences.map((context) => context?.referenceId)).toEqual([
			"tool:read-1",
			"message:message-1",
			"message:message-1",
			"image:0",
		]);
		expect(references).toEqual(
			liveReferences.map((context) => ({ ...context, replaying: true })),
		);
		expect(references.every((context) => context?.sessionId === "sess-1")).toBe(
			true,
		);
		await resumed.adapter.dispose();
	});

	it("keeps an image block streamed inside an agent message", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startWithStore(agent, () => ({
			path: ".superset/attachments/inline-789.png",
		}));
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "Here it is:" },
		});
		agent.notify("sess-1", {
			sessionUpdate: "agent_message_chunk",
			content: { type: "image", data: PNG_BASE64, mimeType: "image/png" },
		});
		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-after",
			title: "Next",
			kind: "other",
		});
		await flush();

		const message = lastAgentMessage(events);
		expect(message?.text).toBe("Here it is:");
		expect(message?.completedAtMs).toBeDefined();
		expect(message?.attachments).toEqual([
			{
				type: "image",
				path: ".superset/attachments/inline-789.png",
				mimeType: "image/png",
				width: 640,
				height: 480,
			},
		]);

		await adapter.dispose();
	});

	it("keeps an image from a whole agent message, which is how a replay delivers one", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startWithStore(agent, () => ({
			path: ".superset/attachments/whole-012.png",
		}));
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "agent_message",
			messageId: "a9",
			content: [
				{ type: "text", text: "Done." },
				{ type: "image", data: PNG_BASE64, mimeType: "image/png" },
			],
		});
		await flush();

		const message = lastAgentMessage(events);
		expect(message?.text).toBe("Done.");
		expect(message?.attachments?.map((entry) => entry.type)).toEqual(["image"]);

		await adapter.dispose();
	});

	it("empties inline image payloads a tool result repeats in its raw output", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startWithStore(agent, () => ({
			path: ".superset/attachments/raw-345.png",
		}));
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-raw",
			title: "Read shot.png",
			kind: "read",
			status: "completed",
			content: [
				{
					type: "content",
					content: { type: "image", data: PNG_BASE64, mimeType: "image/png" },
				},
			],
			rawOutput: [
				{
					type: "image",
					data: PNG_BASE64,
					source: {
						type: "base64",
						media_type: "image/png",
						data: PNG_BASE64,
					},
				},
			],
		});
		await flush();

		const call = lastToolCall(events);
		expect(call?.rawOutput).toEqual([
			{
				type: "image",
				data: "",
				source: { type: "base64", media_type: "image/png", data: "" },
			},
		]);
		expect(JSON.stringify(call)).not.toContain(PNG_BASE64);

		await adapter.dispose();
	});

	it("drops an image when nothing stores it", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startWithStore(agent, undefined);
		await flush();
		agent.notify("sess-1", {
			sessionUpdate: "tool_call_update",
			toolCallId: "tc-nostore",
			title: "Read shot.png",
			kind: "read",
			status: "completed",
			content: [
				{
					type: "content",
					content: { type: "image", data: PNG_BASE64, mimeType: "image/png" },
				},
			],
		});
		await flush();

		const call = lastToolCall(events);
		expect(call?.content).toEqual([]);
		expect(call?.attachments).toBeUndefined();

		await adapter.dispose();
	});
});

describe("AcpAdapter when the agent fails", () => {
	it("fails the running turn when the agent exits mid-turn", async () => {
		const agent = new FakeAcpAgent();
		agent.holdPrompts = true;
		const { adapter, events } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "hi" }]);
		await flush();

		agent.exit(1);
		await flush();

		const turns = events.flatMap((e) => (e.type === "turn" ? [e.turn] : []));
		expect(turns.at(-1)?.status).toBe("failed");
		expect(sessionsOf(events).at(-1)?.status).toBe("dead");

		await adapter.dispose();
	});

	it("shows what the agent wrote to stderr when it exits", async () => {
		const agent = new FakeAcpAgent();
		const { adapter, events } = startAdapter(agent);
		await flush();

		agent.stderr("Error: ANTHROPIC_API_KEY is invalid\n");
		agent.exit(1);
		await flush();

		const notice = itemsOf(events).find((i) => i.kind === "notice");
		expect(textOf(notice)).toContain("ANTHROPIC_API_KEY is invalid");

		await adapter.dispose();
	});

	it("keeps a resume dead when the load fails for a reason other than a missing session", async () => {
		for (const [version, method] of [
			[1, "session/load"],
			[2, "session/resume"],
		] as const) {
			const agent = new FakeAcpAgent();
			agent.protocolVersion = version;
			agent.loadError = {
				code: -32603,
				message: "Internal error: model not found",
			};
			const { adapter, events } = startAdapter(agent, "sess-1");
			await flush(40);

			expect(agent.sent.map((f) => f.method)).toEqual(["initialize", method]);
			expect(sessionsOf(events).at(-1)?.status).toBe("dead");

			await adapter.dispose();
		}
	});

	it("opens a new session when the agent does not know the session id", async () => {
		const agent = new FakeAcpAgent();
		agent.loadError = { code: -32602, message: "Unknown sessionId: sess-1" };
		const { adapter, events } = startAdapter(agent, "sess-1");
		await flush(40);

		expect(agent.sent.map((f) => f.method)).toContain("session/new");
		expect(sessionsOf(events).at(-1)?.status).toBe("idle");

		await adapter.dispose();
	});

	it("gives up on an agent that does not answer at startup", async () => {
		const agent = new FakeAcpAgent();
		agent.silent = true;
		const { adapter, events } = startAdapter(
			agent,
			undefined,
			{},
			{ startupTimeoutMs: 5 },
		);
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(sessionsOf(events).at(-1)?.status).toBe("dead");
		const notice = itemsOf(events).find((i) => i.kind === "notice");
		expect(textOf(notice)).toContain("did not answer");

		await adapter.dispose();
	});

	it("answers a pending approval as cancelled when the turn is stopped", async () => {
		const agent = new FakeAcpAgent();
		agent.holdPrompts = true;
		const { adapter } = startAdapter(agent);
		await flush();
		adapter.prompt([{ type: "text", text: "run the tests" }]);
		await flush();
		const requestId = agent.requestPermission("sess-1", "tc-1");
		await flush();

		adapter.cancelTurn();

		expect(agent.sent.map((f) => f.method)).toContain("session/cancel");
		expect(agent.responseTo(requestId)?.result).toEqual({
			outcome: { outcome: "cancelled" },
		});

		await adapter.dispose();
	});
});
