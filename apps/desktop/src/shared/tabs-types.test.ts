import { describe, expect, test } from "bun:test";
import {
	acknowledgedStatus,
	getHighestPriorityStatus,
	pickHigherStatus,
} from "./tabs-types";

/**
 * Tests for the pane focus state mechanism.
 *
 * When a user clicks a pane, `setFocusedPane` is called which:
 * 1. Updates `focusedPaneIds[tabId]` to the clicked paneId
 * 2. Calls `acknowledgedStatus(pane.status)` to clear review indicators
 *
 * `BasePaneWindow` reads `focusedPaneIds[tabId] === paneId` to derive
 * `isActive`, then applies `mosaic-window-focused` CSS class to provide
 * visual distinction (border highlight) for the focused pane.
 *
 * Issue #1920: the focused pane border was `var(--color-border)` (same as
 * unfocused), so no visual distinction was shown. Fixed by using
 * `var(--color-ring)` for `.mosaic-window-focused` border-color.
 */
describe("acknowledgedStatus", () => {
	test("clears review status when pane is focused", () => {
		// Focusing a pane with "review" status should clear it to "idle"
		// so the green completion indicator goes away once the user looks at it
		expect(acknowledgedStatus("review")).toBe("idle");
	});

	test("preserves permission status when pane is focused", () => {
		// Permission prompts must remain visible even after pane focus
		expect(acknowledgedStatus("permission")).toBe("permission");
	});

	test("preserves working status when pane is focused", () => {
		// In-progress work must remain visible even after pane focus
		expect(acknowledgedStatus("working")).toBe("working");
	});

	test("preserves idle status when pane is focused", () => {
		expect(acknowledgedStatus("idle")).toBe("idle");
	});

	test("defaults to idle for undefined status", () => {
		expect(acknowledgedStatus(undefined)).toBe("idle");
	});
});

describe("focusedPaneIds tracking", () => {
	test("equality check correctly identifies focused pane", () => {
		// This mirrors the logic in BasePaneWindow:
		//   const isActive = focusedPaneIds[tabId] === paneId
		const focusedPaneIds: Record<string, string> = {
			"tab-1": "pane-a",
			"tab-2": "pane-c",
		};

		// Active pane in tab-1
		expect(focusedPaneIds["tab-1"] === "pane-a").toBe(true);
		// Inactive panes in same tab
		expect(focusedPaneIds["tab-1"] === "pane-b").toBe(false);
		// Active pane in tab-2
		expect(focusedPaneIds["tab-2"] === "pane-c").toBe(true);
	});

	test("only one pane per tab can be focused at a time", () => {
		// Focusing pane-b in tab-1 replaces pane-a
		const focusedPaneIds: Record<string, string> = { "tab-1": "pane-a" };
		const updated = { ...focusedPaneIds, "tab-1": "pane-b" };

		expect(updated["tab-1"]).toBe("pane-b");
		// The previous pane is no longer focused
		expect(updated["tab-1"] === "pane-a").toBe(false);
	});

	test("focus in one tab does not affect another tab", () => {
		const focusedPaneIds: Record<string, string> = {
			"tab-1": "pane-a",
			"tab-2": "pane-c",
		};
		// Focusing a new pane in tab-1 should not affect tab-2
		const updated = { ...focusedPaneIds, "tab-1": "pane-b" };

		expect(updated["tab-1"]).toBe("pane-b");
		expect(updated["tab-2"]).toBe("pane-c");
	});
});

describe("pickHigherStatus", () => {
	test("returns higher priority status", () => {
		expect(pickHigherStatus("working", "review")).toBe("working");
		expect(pickHigherStatus("permission", "working")).toBe("permission");
		expect(pickHigherStatus("idle", "review")).toBe("review");
	});

	test("returns first on tie", () => {
		expect(pickHigherStatus("idle", "idle")).toBe("idle");
		expect(pickHigherStatus("working", "working")).toBe("working");
	});

	test("handles undefined gracefully", () => {
		expect(pickHigherStatus(undefined, "review")).toBe("review");
		expect(pickHigherStatus("working", undefined)).toBe("working");
		expect(pickHigherStatus(undefined, undefined)).toBe("idle");
	});
});

describe("getHighestPriorityStatus", () => {
	test("returns null when all panes are idle (no indicator needed)", () => {
		expect(getHighestPriorityStatus(["idle", "idle", undefined])).toBeNull();
	});

	test("returns highest priority across multiple panes", () => {
		expect(getHighestPriorityStatus(["idle", "working", "review"])).toBe(
			"working",
		);
		expect(getHighestPriorityStatus(["permission", "working", "review"])).toBe(
			"permission",
		);
	});

	test("returns null for empty iterable", () => {
		expect(getHighestPriorityStatus([])).toBeNull();
	});
});
