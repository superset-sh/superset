import { describe, expect, it } from "bun:test";
import type { V1PaneAgentSession } from "main/lib/app-state/schemas";
import {
	applyV1AgentHookEvent,
	applyV1TerminalExit,
} from "./v1-agent-sessions";

const T0 = 1_000_000;

function record(
	overrides: Partial<V1PaneAgentSession> = {},
): V1PaneAgentSession {
	return {
		agentId: "claude",
		agentSessionId: "session-a",
		prompted: true,
		updatedAt: T0,
		...overrides,
	};
}

describe("applyV1AgentHookEvent", () => {
	it("starts a fresh un-prompted record on SessionStart", () => {
		const next = applyV1AgentHookEvent(undefined, {
			rawEventType: "SessionStart",
			agentId: "claude",
			agentSessionId: "session-a",
			at: T0,
		});
		expect(next).toEqual({
			agentId: "claude",
			agentSessionId: "session-a",
			prompted: false,
			updatedAt: T0,
		});
	});

	it("ignores a SessionStart without a session id", () => {
		const next = applyV1AgentHookEvent(undefined, {
			rawEventType: "SessionStart",
			agentId: "claude",
			at: T0,
		});
		expect(next).toBeUndefined();
	});

	it("a new session id replaces the record and resets prompted", () => {
		const next = applyV1AgentHookEvent(record(), {
			rawEventType: "SessionStart",
			agentId: "claude",
			agentSessionId: "session-b",
			at: T0 + 1,
		});
		expect(next).toEqual({
			agentId: "claude",
			agentSessionId: "session-b",
			prompted: false,
			updatedAt: T0 + 1,
		});
	});

	it("a same-session SessionStart (resume) keeps prompted and clears the goodbye", () => {
		const next = applyV1AgentHookEvent(record({ endedAt: T0 }), {
			rawEventType: "SessionStart",
			agentId: "claude",
			agentSessionId: "session-a",
			at: T0 + 60_000,
		});
		expect(next?.prompted).toBe(true);
		expect(next?.endedAt).toBeUndefined();
	});

	it("marks prompted on the first prompt-class event", () => {
		const started = applyV1AgentHookEvent(undefined, {
			rawEventType: "SessionStart",
			agentId: "claude",
			agentSessionId: "session-a",
			at: T0,
		});
		const next = applyV1AgentHookEvent(started, {
			rawEventType: "UserPromptSubmit",
			agentId: "claude",
			agentSessionId: "session-a",
			at: T0 + 1,
		});
		expect(next?.prompted).toBe(true);
	});

	it("creates a prompted record from a bare Stop when no record exists (agents without session-start hooks)", () => {
		const next = applyV1AgentHookEvent(undefined, {
			rawEventType: "Stop",
			agentId: "codex",
			agentSessionId: "session-c",
			at: T0,
		});
		expect(next).toEqual({
			agentId: "codex",
			agentSessionId: "session-c",
			prompted: true,
			updatedAt: T0,
		});
	});

	it("records the agent's own SessionEnd as a clean quit", () => {
		const next = applyV1AgentHookEvent(record(), {
			rawEventType: "SessionEnd",
			agentId: "claude",
			agentSessionId: "session-a",
			at: T0 + 5,
		});
		expect(next?.endedAt).toBe(T0 + 5);
	});

	it("ignores a goodbye from a different session", () => {
		const next = applyV1AgentHookEvent(record(), {
			rawEventType: "SessionEnd",
			agentId: "claude",
			agentSessionId: "session-other",
			at: T0 + 5,
		});
		expect(next).toBeUndefined();
	});

	it("a straggler event within the window must not revive a clean quit", () => {
		const next = applyV1AgentHookEvent(record({ endedAt: T0 }), {
			rawEventType: "Stop",
			agentId: "claude",
			agentSessionId: "session-a",
			at: T0 + 10_000,
		});
		expect(next).toBeUndefined();
	});

	it("an event well past the goodbye revives the record", () => {
		const next = applyV1AgentHookEvent(record({ endedAt: T0 }), {
			rawEventType: "Stop",
			agentId: "claude",
			agentSessionId: "session-a",
			at: T0 + 60_000,
		});
		expect(next?.endedAt).toBeUndefined();
		expect(next?.prompted).toBe(true);
	});

	it("a different session id right after a goodbye starts a new record", () => {
		const next = applyV1AgentHookEvent(record({ endedAt: T0 }), {
			rawEventType: "Stop",
			agentId: "claude",
			agentSessionId: "session-b",
			at: T0 + 1_000,
		});
		expect(next).toEqual({
			agentId: "claude",
			agentSessionId: "session-b",
			prompted: true,
			updatedAt: T0 + 1_000,
		});
	});

	it("never inherits the session id across an agent change", () => {
		// claude quit cleanly, then codex (whose v1 events carry no session
		// id) runs in the same pane well past the straggler window — reviving
		// would mint a codex candidate pointing at the claude session.
		const next = applyV1AgentHookEvent(record({ endedAt: T0 }), {
			rawEventType: "Stop",
			agentId: "codex",
			at: T0 + 60_000,
		});
		expect(next).toBeUndefined();
	});

	it("a different agent with its own session id replaces the record", () => {
		const next = applyV1AgentHookEvent(record(), {
			rawEventType: "Stop",
			agentId: "codex",
			agentSessionId: "codex-sess",
			at: T0 + 1,
		});
		expect(next).toEqual({
			agentId: "codex",
			agentSessionId: "codex-sess",
			prompted: true,
			updatedAt: T0 + 1,
		});
	});

	it("ignores a goodbye from a different agent", () => {
		const next = applyV1AgentHookEvent(record(), {
			rawEventType: "SessionEnd",
			agentId: "gemini",
			at: T0 + 5,
		});
		expect(next).toBeUndefined();
	});

	it("skips persistence when nothing material changes", () => {
		// Already prompted, same live session: a Stop stream must not
		// rewrite app-state.json on every turn.
		const live = record();
		expect(
			applyV1AgentHookEvent(live, {
				rawEventType: "Stop",
				agentId: "claude",
				agentSessionId: "session-a",
				at: T0 + 1,
			}),
		).toBeUndefined();
		expect(
			applyV1AgentHookEvent(live, {
				rawEventType: "SessionStart",
				agentId: "claude",
				agentSessionId: "session-a",
				at: T0 + 1,
			}),
		).toBeUndefined();
	});

	it("ignores unknown event types", () => {
		const next = applyV1AgentHookEvent(record(), {
			rawEventType: "SomethingNew",
			agentId: "claude",
			agentSessionId: "session-a",
			at: T0 + 1,
		});
		expect(next).toBeUndefined();
	});
});

describe("applyV1TerminalExit", () => {
	it("upgrades a death-gasp goodbye back to resumable", () => {
		const next = applyV1TerminalExit(record({ endedAt: T0 }), T0 + 5_000);
		expect(next?.endedAt).toBeUndefined();
		expect(next?.prompted).toBe(true);
	});

	it("leaves an old goodbye final — the shell outlived the agent", () => {
		expect(
			applyV1TerminalExit(record({ endedAt: T0 }), T0 + 60_000),
		).toBeUndefined();
	});

	it("changes nothing when the session never said goodbye", () => {
		expect(applyV1TerminalExit(record(), T0 + 1)).toBeUndefined();
		expect(applyV1TerminalExit(undefined, T0 + 1)).toBeUndefined();
	});
});
