import { describe, expect, it } from "bun:test";
import type { Pane, PaneRegistry } from "@superset/panes";
import type { PaneViewerData } from "../../types";
import { resolvePaneLabel } from "./resolvePaneLabel";

function makePane(overrides: Partial<Pane<PaneViewerData>> = {}) {
	return {
		id: "pane-1",
		kind: "chat",
		data: { sessionId: null },
		...overrides,
	} as Pane<PaneViewerData>;
}

/**
 * Minimal stand-in for the real registry. Only the title-related members
 * matter here, so definitions are cast rather than fully constructed.
 */
function makeRegistry(
	definitions: Record<string, unknown>,
): PaneRegistry<PaneViewerData> {
	return definitions as PaneRegistry<PaneViewerData>;
}

const EMPTY_CHAT_TITLES = new Map<string, string>();

describe("resolvePaneLabel", () => {
	it("prefers an explicit pane rename over everything else", () => {
		const label = resolvePaneLabel({
			pane: makePane({ titleOverride: "My rename" }),
			registry: makeRegistry({ chat: { getTitle: () => "Chat" } }),
			chatTitlesBySessionId: new Map([["s-1", "Session title"]]),
		});

		expect(label).toBe("My rename");
	});

	it("uses the runtime title source ahead of the static title", () => {
		const label = resolvePaneLabel({
			pane: makePane({ kind: "terminal" }),
			registry: makeRegistry({
				terminal: {
					getTitle: () => "Terminal",
					titleSource: () => ({
						subscribe: () => () => {},
						getSnapshot: () => "bun test",
					}),
				},
			}),
			chatTitlesBySessionId: EMPTY_CHAT_TITLES,
		});

		expect(label).toBe("bun test");
	});

	it("falls back to the static title when the runtime title is blank", () => {
		const label = resolvePaneLabel({
			pane: makePane({ kind: "terminal" }),
			registry: makeRegistry({
				terminal: {
					getTitle: () => "Terminal",
					titleSource: () => ({
						subscribe: () => () => {},
						getSnapshot: () => "   ",
					}),
				},
			}),
			chatTitlesBySessionId: EMPTY_CHAT_TITLES,
		});

		expect(label).toBe("Terminal");
	});

	it("resolves a chat pane to its session title", () => {
		// The whole point of the switcher: two chat panes must not both
		// read "Chat".
		const label = resolvePaneLabel({
			pane: makePane({ data: { sessionId: "s-1" } as PaneViewerData }),
			registry: makeRegistry({ chat: { getTitle: () => "Chat" } }),
			chatTitlesBySessionId: new Map([["s-1", "Fix the parser"]]),
		});

		expect(label).toBe("Fix the parser");
	});

	it("falls back to the static chat title for a session with no title yet", () => {
		const label = resolvePaneLabel({
			pane: makePane({ data: { sessionId: "s-unknown" } as PaneViewerData }),
			registry: makeRegistry({ chat: { getTitle: () => "Chat" } }),
			chatTitlesBySessionId: new Map([["s-1", "Fix the parser"]]),
		});

		expect(label).toBe("Chat");
	});

	it("falls back to the pane kind when the registry has no title at all", () => {
		const label = resolvePaneLabel({
			pane: makePane({ kind: "mystery" }),
			registry: makeRegistry({}),
			chatTitlesBySessionId: EMPTY_CHAT_TITLES,
		});

		expect(label).toBe("mystery");
	});
});
