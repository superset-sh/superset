import { describe, expect, it } from "bun:test";
import { focusActivePane, type PaneFocusTarget } from "./focusActivePane";

/**
 * Stand-in for a pane's DOM container that records whether `.focus()` ran and
 * can report containment for a fixed set of descendant "elements".
 */
function fakeContainer(descendants: Node[] = []): PaneFocusTarget & {
	focusCount: number;
} {
	return {
		focusCount: 0,
		focus() {
			this.focusCount += 1;
		},
		contains(node: Node | null) {
			return node != null && descendants.includes(node);
		},
	};
}

/** A minimal stand-in for a focused DOM node — only identity matters here. */
function fakeNode(id: string): Node {
	return { id } as unknown as Node;
}

describe("focusActivePane", () => {
	// Reproduces issue #5317: switching to a pane via keyboard moves the cursor
	// nowhere. When a pane becomes active while focus still lives in another pane
	// (the Claude Code terminal), focus must follow the selection into the pane.
	it("moves focus into the pane when it becomes active and focus is elsewhere", () => {
		const container = fakeContainer();
		const terminalInAnotherPane = fakeNode("xterm-textarea");

		const moved = focusActivePane({
			isActive: true,
			container,
			activeElement: terminalInAnotherPane,
		});

		expect(moved).toBe(true);
		expect(container.focusCount).toBe(1);
	});

	it("does not steal focus from an element already inside the active pane", () => {
		const editor = fakeNode("codemirror-content");
		const container = fakeContainer([editor]);

		const moved = focusActivePane({
			isActive: true,
			container,
			activeElement: editor,
		});

		expect(moved).toBe(false);
		expect(container.focusCount).toBe(0);
	});

	it("does nothing for an inactive pane", () => {
		const container = fakeContainer();

		const moved = focusActivePane({
			isActive: false,
			container,
			activeElement: fakeNode("somewhere-else"),
		});

		expect(moved).toBe(false);
		expect(container.focusCount).toBe(0);
	});

	it("is a no-op when the pane has not mounted yet", () => {
		expect(
			focusActivePane({
				isActive: true,
				container: null,
				activeElement: fakeNode("somewhere-else"),
			}),
		).toBe(false);
	});

	it("focuses the pane when nothing currently holds focus", () => {
		const container = fakeContainer();

		const moved = focusActivePane({
			isActive: true,
			container,
			activeElement: null,
		});

		expect(moved).toBe(true);
		expect(container.focusCount).toBe(1);
	});
});
