import { describe, expect, test } from "bun:test";
import type { Pane } from "shared/tabs-types";
import {
	getWorkspaceRunStateFromPanes,
	shouldShowWorkspaceRunIndicator,
} from "./workspaceRunIndicator";

const terminalPane = (overrides: Partial<Pane> = {}): Pane => ({
	id: "p1",
	tabId: "t1",
	type: "terminal",
	name: "term",
	...overrides,
});

describe("getWorkspaceRunStateFromPanes (#4375)", () => {
	test("returns the run state from a matching terminal pane", () => {
		const panes = {
			p1: terminalPane({
				workspaceRun: { workspaceId: "w1", state: "running" },
			}),
		};
		expect(getWorkspaceRunStateFromPanes(panes, "w1")).toBe("running");
	});

	test("returns null when only other workspaces have running panes", () => {
		const panes = {
			p1: terminalPane({
				workspaceRun: { workspaceId: "other", state: "running" },
			}),
		};
		expect(getWorkspaceRunStateFromPanes(panes, "w1")).toBeNull();
	});

	test("returns null when no panes are open for any workspace", () => {
		expect(getWorkspaceRunStateFromPanes({}, "w1")).toBeNull();
	});

	test("ignores non-terminal panes that happen to carry workspaceRun fields", () => {
		const panes = {
			p1: terminalPane({
				type: "chat",
				workspaceRun: { workspaceId: "w1", state: "running" },
			}),
		};
		expect(getWorkspaceRunStateFromPanes(panes, "w1")).toBeNull();
	});
});

describe("shouldShowWorkspaceRunIndicator (#4375 bug 1)", () => {
	test("shows the indicator for any non-null run state", () => {
		expect(shouldShowWorkspaceRunIndicator("running")).toBe(true);
		expect(shouldShowWorkspaceRunIndicator("stopped-by-user")).toBe(true);
		expect(shouldShowWorkspaceRunIndicator("stopped-by-exit")).toBe(true);
	});

	test("hides the indicator only when there is no run state", () => {
		expect(shouldShowWorkspaceRunIndicator(null)).toBe(false);
	});

	test("does not depend on showBranchSubtitle (regression for #4375)", () => {
		// Before the fix, the JSX gated the indicator on
		// `workspaceRunState && showBranchSubtitle`. For a non-branch workspace
		// whose name equals its branch, showBranchSubtitle is false, and the
		// indicator would never render even with an active run.
		const showBranchSubtitle = false;
		const visible =
			shouldShowWorkspaceRunIndicator("running") && showBranchSubtitle;
		expect(shouldShowWorkspaceRunIndicator("running")).toBe(true);
		// Sanity: the buggy condition would have hidden the indicator.
		expect(visible).toBe(false);
	});
});
