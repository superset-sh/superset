import { describe, expect, test } from "bun:test";
import { pruneV1AgentSessions } from "./prune-v1-agent-sessions";

const session = {
	agentId: "claude",
	agentSessionId: "s1",
	prompted: true,
	updatedAt: 1,
};

describe("pruneV1AgentSessions", () => {
	test("keeps a session whose pane lives in a per-window record", () => {
		const kept = pruneV1AgentSessions({ p1: session }, [
			{ panes: {} },
			{ panes: { p1: {} } },
		]);
		expect(kept).toEqual({ p1: session });
	});

	test("drops a session whose pane is in no record", () => {
		expect(
			pruneV1AgentSessions({ gone: session }, [{ panes: null }, { panes: {} }]),
		).toEqual({});
	});
});
