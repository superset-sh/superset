import { describe, expect, it } from "bun:test";
import {
	type MastraChatEventEnvelope,
	type MastraChatEventRow,
	materializeMastraChatState,
	materializeMastraChatStateFromRows,
} from "./index";

const SESSION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function ts(offset: number): string {
	return new Date(1_700_000_000_000 + offset * 1000).toISOString();
}

function event(input: {
	kind?: "submit" | "harness";
	sessionId?: string;
	timestamp?: string;
	sequenceHint: number;
	payload: unknown;
}): MastraChatEventEnvelope {
	return {
		kind: input.kind ?? "harness",
		sessionId: input.sessionId ?? SESSION_A,
		timestamp: input.timestamp ?? ts(input.sequenceHint),
		sequenceHint: input.sequenceHint,
		payload: input.payload,
	};
}

function row(
	id: string,
	envelope: MastraChatEventEnvelope,
): MastraChatEventRow {
	return { id, ...envelope };
}

describe("materializeMastraChatState edge cases", () => {
	it("returns default empty state for empty input", () => {
		const state = materializeMastraChatState([]);
		expect(state).toEqual({
			sessionId: null,
			epoch: 0,
			sequenceResetCount: 0,
			isRunning: false,
			messages: [],
			controls: [],
			errors: [],
			auxiliaryEvents: [],
		});
	});

	it("sets sessionId from first event and epoch to 1", () => {
		const state = materializeMastraChatState([
			event({ sequenceHint: 0, payload: { type: "agent_start" } }),
		]);
		expect(state.sessionId).toBe(SESSION_A);
		expect(state.epoch).toBe(1);
	});

	it("ignores events from other sessions", () => {
		const state = materializeMastraChatState([
			event({ sequenceHint: 0, payload: { type: "agent_start" } }),
			event({
				sessionId: SESSION_B,
				sequenceHint: 1,
				payload: { type: "error", message: "ignore me" },
			}),
		]);
		expect(state.errors).toHaveLength(0);
		expect(state.sessionId).toBe(SESSION_A);
	});

	it("increments sequence reset count when sequence decreases", () => {
		const state = materializeMastraChatState([
			event({ sequenceHint: 3, payload: { type: "agent_start" } }),
			event({ sequenceHint: 1, payload: { type: "agent_end" } }),
		]);
		expect(state.sequenceResetCount).toBe(1);
		expect(state.epoch).toBe(2);
	});

	it("increments sequence reset count multiple times", () => {
		const state = materializeMastraChatState([
			event({ sequenceHint: 5, payload: { type: "agent_start" } }),
			event({ sequenceHint: 2, payload: { type: "agent_end" } }),
			event({ sequenceHint: 7, payload: { type: "agent_start" } }),
			event({ sequenceHint: 1, payload: { type: "agent_end" } }),
		]);
		expect(state.sequenceResetCount).toBe(2);
		expect(state.epoch).toBe(3);
	});

	it("does not count reset when sequence stays equal", () => {
		const state = materializeMastraChatState([
			event({ sequenceHint: 2, payload: { type: "agent_start" } }),
			event({ sequenceHint: 2, payload: { type: "agent_end" } }),
		]);
		expect(state.sequenceResetCount).toBe(0);
		expect(state.epoch).toBe(1);
	});

	it("materializes user submit event", () => {
		const state = materializeMastraChatState([
			event({
				kind: "submit",
				sequenceHint: 0,
				payload: {
					type: "user_message_submitted",
					data: { content: "hello" },
				},
			}),
		]);

		expect(state.messages).toEqual([
			{
				id: `user-${ts(0)}-0`,
				role: "user",
				text: "hello",
				createdAt: ts(0),
				status: "complete",
				source: "submit",
			},
		]);
	});

	it("uses empty string when submit content missing", () => {
		const state = materializeMastraChatState([
			event({
				kind: "submit",
				sequenceHint: 0,
				payload: { type: "user_message_submitted", data: {} },
			}),
		]);
		expect(state.messages[0]?.text).toBe("");
	});

	it("uses clientMessageId as message id", () => {
		const state = materializeMastraChatState([
			event({
				kind: "submit",
				sequenceHint: 0,
				payload: {
					type: "user_message_submitted",
					data: { content: "hi", clientMessageId: "client-1" },
				},
			}),
		]);
		expect(state.messages[0]?.id).toBe("client-1");
	});

	it("dedupes repeated clientMessageId by updating existing message", () => {
		const state = materializeMastraChatState([
			event({
				kind: "submit",
				sequenceHint: 0,
				payload: {
					type: "user_message_submitted",
					data: { content: "first", clientMessageId: "client-1" },
				},
			}),
			event({
				kind: "submit",
				sequenceHint: 1,
				payload: {
					type: "user_message_submitted",
					data: { content: "second", clientMessageId: "client-1" },
				},
			}),
		]);
		expect(state.messages).toHaveLength(1);
		expect(state.messages[0]?.text).toBe("second");
	});

	it("captures control submission with wasRunning=false by default", () => {
		const state = materializeMastraChatState([
			event({
				kind: "submit",
				sequenceHint: 0,
				payload: { type: "control_submitted", data: { action: "abort" } },
			}),
		]);
		expect(state.controls).toEqual([
			{ action: "abort", submittedAt: ts(0), wasRunning: false },
		]);
	});

	it("captures control submission with wasRunning=true if agent already started", () => {
		const state = materializeMastraChatState([
			event({ sequenceHint: 0, payload: { type: "agent_start" } }),
			event({
				kind: "submit",
				sequenceHint: 1,
				payload: { type: "control_submitted", data: { action: "abort" } },
			}),
		]);
		expect(state.controls[0]?.wasRunning).toBeTrue();
	});

	it("stores unknown submit event in auxiliaryEvents", () => {
		const state = materializeMastraChatState([
			event({
				kind: "submit",
				sequenceHint: 0,
				payload: { type: "approval_submitted", data: { decision: "approve" } },
			}),
		]);
		expect(state.auxiliaryEvents).toHaveLength(1);
		expect(state.auxiliaryEvents[0]?.type).toBe("approval_submitted");
	});

	it("sets running=true on agent_start", () => {
		const state = materializeMastraChatState([
			event({ sequenceHint: 0, payload: { type: "agent_start" } }),
		]);
		expect(state.isRunning).toBeTrue();
	});

	it("sets running=false and reason on agent_end", () => {
		const state = materializeMastraChatState([
			event({ sequenceHint: 0, payload: { type: "agent_start" } }),
			event({
				sequenceHint: 1,
				payload: { type: "agent_end", reason: "aborted" },
			}),
		]);
		expect(state.isRunning).toBeFalse();
		expect(state.lastAgentEndReason).toBe("aborted");
	});

	it("keeps latest agent_end reason", () => {
		const state = materializeMastraChatState([
			event({
				sequenceHint: 0,
				payload: { type: "agent_end", reason: "error" },
			}),
			event({
				sequenceHint: 1,
				payload: { type: "agent_end", reason: "complete" },
			}),
		]);
		expect(state.lastAgentEndReason).toBe("complete");
	});

	it("materializes assistant message_start as streaming", () => {
		const state = materializeMastraChatState([
			event({
				sequenceHint: 0,
				payload: {
					type: "message_start",
					message: {
						id: "a1",
						role: "assistant",
						content: [{ type: "text", text: "hi" }],
						createdAt: ts(0),
					},
				},
			}),
		]);
		expect(state.messages[0]).toMatchObject({
			id: "a1",
			role: "assistant",
			text: "hi",
			status: "streaming",
			source: "harness",
		});
	});

	it("updates existing assistant message on message_update", () => {
		const state = materializeMastraChatState([
			event({
				sequenceHint: 0,
				payload: {
					type: "message_start",
					message: {
						id: "a1",
						role: "assistant",
						content: [{ type: "text", text: "h" }],
						createdAt: ts(0),
					},
				},
			}),
			event({
				sequenceHint: 1,
				payload: {
					type: "message_update",
					message: {
						id: "a1",
						role: "assistant",
						content: [{ type: "text", text: "hello" }],
						createdAt: ts(0),
					},
				},
			}),
		]);
		expect(state.messages).toHaveLength(1);
		expect(state.messages[0]?.text).toBe("hello");
		expect(state.messages[0]?.status).toBe("streaming");
	});

	it("marks assistant message complete on message_end", () => {
		const state = materializeMastraChatState([
			event({
				sequenceHint: 0,
				payload: {
					type: "message_end",
					message: {
						id: "a1",
						role: "assistant",
						content: [{ type: "text", text: "done" }],
						createdAt: ts(0),
					},
				},
			}),
		]);
		expect(state.messages[0]?.status).toBe("complete");
	});

	it("defaults invalid message role to assistant", () => {
		const state = materializeMastraChatState([
			event({
				sequenceHint: 0,
				payload: {
					type: "message_end",
					message: {
						id: "x",
						role: "invalid",
						content: [{ type: "text", text: "text" }],
						createdAt: ts(0),
					},
				},
			}),
		]);
		expect(state.messages[0]?.role).toBe("assistant");
	});

	it("extracts only text content parts", () => {
		const state = materializeMastraChatState([
			event({
				sequenceHint: 0,
				payload: {
					type: "message_end",
					message: {
						id: "x",
						role: "assistant",
						content: [
							{ type: "text", text: "A" },
							{ type: "tool_call", id: "t1", name: "ls" },
							{ type: "text", text: "B" },
						],
						createdAt: ts(0),
					},
				},
			}),
		]);
		expect(state.messages[0]?.text).toBe("AB");
	});

	it("ignores message events missing message payload", () => {
		const state = materializeMastraChatState([
			event({ sequenceHint: 0, payload: { type: "message_update" } }),
		]);
		expect(state.messages).toHaveLength(0);
	});

	it("creates fallback assistant id when message.id is missing", () => {
		const state = materializeMastraChatState([
			event({
				sequenceHint: 0,
				timestamp: ts(10),
				payload: {
					type: "message_end",
					message: {
						role: "assistant",
						content: [{ type: "text", text: "x" }],
					},
				},
			}),
		]);
		expect(state.messages[0]?.id).toBe(`assistant-${ts(10)}-0`);
	});

	it("stores usage_update with numeric defaults", () => {
		const state = materializeMastraChatState([
			event({
				sequenceHint: 0,
				payload: {
					type: "usage_update",
					usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
				},
			}),
		]);
		expect(state.usage).toEqual({
			promptTokens: 1,
			completionTokens: 2,
			totalTokens: 3,
		});
	});

	it("ignores malformed usage_update payload", () => {
		const state = materializeMastraChatState([
			event({
				sequenceHint: 0,
				payload: { type: "usage_update", usage: null },
			}),
		]);
		expect(state.usage).toBeUndefined();
	});

	it("uses payload.error.message for error message", () => {
		const state = materializeMastraChatState([
			event({
				sequenceHint: 0,
				payload: { type: "error", error: { message: "boom" } },
			}),
		]);
		expect(state.errors[0]?.message).toBe("boom");
	});

	it("falls back to payload.message for error message", () => {
		const state = materializeMastraChatState([
			event({
				sequenceHint: 0,
				payload: { type: "error", message: "fallback" },
			}),
		]);
		expect(state.errors[0]?.message).toBe("fallback");
	});

	it("uses Unknown Mastra error when no message fields are present", () => {
		const state = materializeMastraChatState([
			event({ sequenceHint: 0, payload: { type: "error" } }),
		]);
		expect(state.errors[0]?.message).toBe("Unknown Mastra error");
	});

	it("stores unknown harness event in auxiliaryEvents", () => {
		const state = materializeMastraChatState([
			event({ sequenceHint: 0, payload: { type: "om_status", x: 1 } }),
		]);
		expect(state.auxiliaryEvents).toHaveLength(1);
		expect(state.auxiliaryEvents[0]?.type).toBe("om_status");
	});

	it("keeps message insertion order by first-seen id", () => {
		const state = materializeMastraChatState([
			event({
				sequenceHint: 0,
				payload: {
					type: "message_end",
					message: {
						id: "a",
						role: "assistant",
						content: [{ type: "text", text: "A" }],
						createdAt: ts(0),
					},
				},
			}),
			event({
				sequenceHint: 1,
				payload: {
					type: "message_end",
					message: {
						id: "b",
						role: "assistant",
						content: [{ type: "text", text: "B" }],
						createdAt: ts(1),
					},
				},
			}),
			event({
				sequenceHint: 2,
				payload: {
					type: "message_update",
					message: {
						id: "a",
						role: "assistant",
						content: [{ type: "text", text: "A2" }],
						createdAt: ts(0),
					},
				},
			}),
		]);
		expect(state.messages.map((m) => m.id)).toEqual(["a", "b"]);
		expect(state.messages[0]?.text).toBe("A2");
	});

	it("materializeFromRows sorts by timestamp then sequence", () => {
		const rows: MastraChatEventRow[] = [
			row(
				"r2",
				event({
					sequenceHint: 1,
					timestamp: ts(10),
					payload: {
						type: "message_end",
						message: {
							id: "a",
							role: "assistant",
							content: [{ type: "text", text: "second" }],
							createdAt: ts(10),
						},
					},
				}),
			),
			row(
				"r1",
				event({
					sequenceHint: 0,
					timestamp: ts(9),
					payload: {
						type: "message_start",
						message: {
							id: "a",
							role: "assistant",
							content: [{ type: "text", text: "first" }],
							createdAt: ts(9),
						},
					},
				}),
			),
		];

		const state = materializeMastraChatStateFromRows(rows);
		expect(state.messages).toHaveLength(1);
		expect(state.messages[0]?.text).toBe("second");
		expect(state.messages[0]?.status).toBe("complete");
	});

	it("materializeFromRows keeps session filtering semantics", () => {
		const rows: MastraChatEventRow[] = [
			row(
				"r1",
				event({
					sessionId: SESSION_B,
					sequenceHint: 0,
					payload: {
						type: "message_end",
						message: {
							id: "b1",
							role: "assistant",
							content: [{ type: "text", text: "B" }],
							createdAt: ts(0),
						},
					},
				}),
			),
			row(
				"r2",
				event({
					sessionId: SESSION_A,
					sequenceHint: 1,
					payload: {
						type: "message_end",
						message: {
							id: "a1",
							role: "assistant",
							content: [{ type: "text", text: "A" }],
							createdAt: ts(1),
						},
					},
				}),
			),
		];

		const state = materializeMastraChatStateFromRows(rows);
		expect(state.sessionId).toBe(SESSION_B);
		expect(state.messages).toHaveLength(1);
		expect(state.messages[0]?.id).toBe("b1");
	});

	it("direct materialization preserves caller order (no implicit sorting)", () => {
		const state = materializeMastraChatState([
			event({ sequenceHint: 3, payload: { type: "agent_start" } }),
			event({ sequenceHint: 1, payload: { type: "agent_end" } }),
		]);
		expect(state.sequenceResetCount).toBe(1);
		expect(state.epoch).toBe(2);
	});

	it("supports system role messages", () => {
		const state = materializeMastraChatState([
			event({
				sequenceHint: 0,
				payload: {
					type: "message_end",
					message: {
						id: "sys-1",
						role: "system",
						content: [{ type: "text", text: "policy" }],
						createdAt: ts(0),
					},
				},
			}),
		]);
		expect(state.messages[0]?.role).toBe("system");
	});

	it("records auxiliary event type fallback when payload has no type", () => {
		const state = materializeMastraChatState([
			event({ kind: "submit", sequenceHint: 0, payload: { data: { x: 1 } } }),
			event({ sequenceHint: 1, payload: { x: 2 } }),
		]);
		expect(state.auxiliaryEvents[0]?.type).toBe("submit_unknown");
		expect(state.auxiliaryEvents[1]?.type).toBe("harness_unknown");
	});
});
