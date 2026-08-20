import { describe, expect, it } from "bun:test";
import type { HostSession } from "../../../HostTerminalsProbe";
import {
	type HostAgentBinding,
	mergeHostAgentSessions,
} from "./mergeHostAgentSessions";

function makeSession(overrides: Partial<HostSession> = {}): HostSession {
	return {
		terminalId: "term-1",
		workspaceId: "ws-1",
		title: "bash",
		...overrides,
	};
}

function makeBinding(
	overrides: Partial<HostAgentBinding> = {},
): HostAgentBinding {
	return {
		terminalId: "term-1",
		workspaceId: "ws-1",
		agentId: "claude-code",
		lastEventType: "Start",
		lastEventAt: 1000,
		...overrides,
	};
}

describe("mergeHostAgentSessions", () => {
	it("turns a session with a live binding into an agent session", () => {
		const session = makeSession();
		const binding = makeBinding();

		const result = mergeHostAgentSessions([session], [binding]);

		expect(result.terminalSessions).toEqual([]);
		expect(result.agentSessions).toEqual([
			{
				terminalId: "term-1",
				workspaceId: "ws-1",
				title: "bash",
				agentId: "claude-code",
				lastEventType: "Start",
				lastEventAt: 1000,
			},
		]);
	});

	it("leaves a session with no matching binding as a plain terminal", () => {
		const session = makeSession({ terminalId: "term-2" });

		const result = mergeHostAgentSessions([session], []);

		expect(result.agentSessions).toEqual([]);
		expect(result.terminalSessions).toEqual([session]);
	});

	it("drops a binding whose terminal has no live session", () => {
		// The agent's terminal already died — nothing to render a card for,
		// on either side of the split.
		const binding = makeBinding({ terminalId: "term-dead" });

		const result = mergeHostAgentSessions([], [binding]);

		expect(result.agentSessions).toEqual([]);
		expect(result.terminalSessions).toEqual([]);
	});

	it("treats an ended binding as not live — the session stays a plain terminal", () => {
		const session = makeSession();
		const binding = makeBinding({ endedAt: 2000 });

		const result = mergeHostAgentSessions([session], [binding]);

		expect(result.agentSessions).toEqual([]);
		expect(result.terminalSessions).toEqual([session]);
	});

	it("resolves several bindings in one workspace to their own terminals, not each other's", () => {
		const sessionA = makeSession({ terminalId: "term-a", title: "agent a" });
		const sessionB = makeSession({ terminalId: "term-b", title: "agent b" });
		const bindingA = makeBinding({
			terminalId: "term-a",
			agentId: "claude-code",
		});
		const bindingB = makeBinding({
			terminalId: "term-b",
			agentId: "codex",
		});

		const result = mergeHostAgentSessions(
			[sessionA, sessionB],
			[bindingA, bindingB],
		);

		expect(result.agentSessions).toEqual([
			{
				terminalId: "term-a",
				workspaceId: "ws-1",
				title: "agent a",
				agentId: "claude-code",
				lastEventType: "Start",
				lastEventAt: 1000,
			},
			{
				terminalId: "term-b",
				workspaceId: "ws-1",
				title: "agent b",
				agentId: "codex",
				lastEventType: "Start",
				lastEventAt: 1000,
			},
		]);
		expect(result.terminalSessions).toEqual([]);
	});

	it("returns empty lists for empty input", () => {
		const result = mergeHostAgentSessions([], []);
		expect(result).toEqual({ agentSessions: [], terminalSessions: [] });
	});
});
