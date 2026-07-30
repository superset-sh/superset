import { describe, expect, it } from "bun:test";
import type { PaneMruEntry } from "renderer/stores/pane-mru";
import { describeEntry } from "./describeEntry";

function makeEntry(overrides: Partial<PaneMruEntry> = {}): PaneMruEntry {
	return {
		workspaceId: "ws-1",
		tabId: "tab-1",
		paneId: "pane-1",
		kind: "terminal",
		label: "bun test",
		tabLabel: "Tests",
		workspaceName: "clean-partridge",
		lastFocusedAt: 1,
		...overrides,
	};
}

describe("describeEntry", () => {
	it("shows the tab label when it adds information", () => {
		const { primary } = describeEntry(makeEntry());

		expect(primary).toBe("Tests › bun test");
	});

	it("drops a tab label that just repeats the pane label", () => {
		const { primary } = describeEntry(
			makeEntry({ label: "Claude", tabLabel: "Claude" }),
		);

		expect(primary).toBe("Claude");
	});

	it("drops names that only restate the agent shown as the logo", () => {
		// The row already carries the Claude mark; spelling it out twice more
		// tells the reader nothing.
		const { primary } = describeEntry(
			makeEntry({ label: "Claude", tabLabel: "Claude", agentId: "claude" }),
		);

		expect(primary).toBe("Terminal");
	});

	it("matches the agent name case- and separator-insensitively", () => {
		const { primary } = describeEntry(
			makeEntry({
				label: "open-code",
				tabLabel: "OpenCode",
				agentId: "opencode",
				kind: "terminal",
			}),
		);

		expect(primary).toBe("Terminal");
	});

	it("keeps a real title even when an agent logo is shown", () => {
		// "Fix the parser" is what distinguishes this session; only the bare
		// agent name is redundant.
		const { primary } = describeEntry(
			makeEntry({
				label: "Fix the parser",
				tabLabel: "Claude",
				agentId: "claude",
			}),
		);

		expect(primary).toBe("Fix the parser");
	});

	it("falls back to a readable kind rather than an empty row", () => {
		const { primary } = describeEntry(
			makeEntry({ label: "", tabLabel: "", kind: "chat" }),
		);

		expect(primary).toBe("Chat");
	});

	it("always surfaces the workspace name, since it is what disambiguates", () => {
		const { secondary } = describeEntry(
			makeEntry({ workspaceName: "five-mahogany" }),
		);

		expect(secondary).toBe("five-mahogany");
	});

	it("prefixes the repo when it is known", () => {
		const { secondary } = describeEntry(
			makeEntry({ projectName: "superset", workspaceName: "five-mahogany" }),
		);

		expect(secondary).toBe("superset / five-mahogany");
	});

	it("omits a blank repo rather than rendering a dangling separator", () => {
		const { secondary } = describeEntry(
			makeEntry({ projectName: "   ", workspaceName: "main" }),
		);

		expect(secondary).toBe("main");
	});
});
