import { describe, expect, it } from "bun:test";
import { sessionDeepLink, workspaceDeepLink } from "./deep-link";

describe("workspaceDeepLink", () => {
	it("builds the bare v2-workspace deep link", () => {
		expect(workspaceDeepLink("ws_123")).toBe("superset://v2-workspace/ws_123");
	});
});

describe("sessionDeepLink", () => {
	// Repro for #5029: `agents run` returns a `sessionId`, but there was no
	// supported way to open that specific session. Opening the bare workspace
	// link leaves the freshly-created session with no pane, so it is invisible.
	// The desktop view only renders a pane when the right search param is set,
	// and the param depends on the session `kind`.
	it("uses chatSessionId for chat sessions", () => {
		expect(sessionDeepLink("ws_123", "chat", "sid_abc")).toBe(
			"superset://v2-workspace/ws_123?chatSessionId=sid_abc",
		);
	});

	it("uses terminalId for terminal sessions", () => {
		expect(sessionDeepLink("ws_123", "terminal", "sid_abc")).toBe(
			"superset://v2-workspace/ws_123?terminalId=sid_abc",
		);
	});

	it("encodes the session id", () => {
		expect(sessionDeepLink("ws_123", "chat", "a/b c")).toBe(
			"superset://v2-workspace/ws_123?chatSessionId=a%2Fb%20c",
		);
	});
});
