import { describe, expect, it } from "bun:test";
import type { Pane } from "@superset/panes";
import type { PaneViewerData } from "../../types";
import { resolvePaneAgentId } from "./resolvePaneAgentId";

function makePane(
	kind: string,
	data: unknown = { terminalId: "term-1" },
): Pane<PaneViewerData> {
	return { id: "pane-1", kind, data } as Pane<PaneViewerData>;
}

const NO_BINDINGS = new Map<string, { agentId?: string }>();

describe("resolvePaneAgentId", () => {
	it("maps a chat pane to the built-in Superset agent", () => {
		expect(
			resolvePaneAgentId({
				pane: makePane("chat", { sessionId: null }),
				label: "Some chat",
				agentBindings: NO_BINDINGS,
			}),
		).toBe("superset");
	});

	it("prefers the lifecycle binding over the title", () => {
		expect(
			resolvePaneAgentId({
				pane: makePane("terminal"),
				label: "Codex",
				agentBindings: new Map([["term-1", { agentId: "claude" }]]),
			}),
		).toBe("claude");
	});

	it("falls back to the title for agents that report no binding", () => {
		// OpenCode and Codex do not call back through lifecycle hooks, so the
		// terminal's own title is the only signal available.
		expect(
			resolvePaneAgentId({
				pane: makePane("terminal"),
				label: "OpenCode",
				agentBindings: NO_BINDINGS,
			}),
		).toBe("opencode");
		expect(
			resolvePaneAgentId({
				pane: makePane("terminal"),
				label: "Codex",
				agentBindings: NO_BINDINGS,
			}),
		).toBe("codex");
	});

	it("matches titles regardless of case and separators", () => {
		expect(
			resolvePaneAgentId({
				pane: makePane("terminal"),
				label: "open-code",
				agentBindings: NO_BINDINGS,
			}),
		).toBe("opencode");
	});

	it("yields nothing for an ordinary terminal title", () => {
		// The title fallback is a heuristic; it must not invent an agent for a
		// terminal that is simply running a command.
		expect(
			resolvePaneAgentId({
				pane: makePane("terminal"),
				label: "bun test",
				agentBindings: NO_BINDINGS,
			}),
		).toBeUndefined();
	});

	it("yields nothing for non-agent pane kinds", () => {
		expect(
			resolvePaneAgentId({
				pane: makePane("browser", { url: "about:blank" }),
				label: "Claude",
				agentBindings: NO_BINDINGS,
			}),
		).toBeUndefined();
	});
});
