import { describe, expect, test } from "bun:test";
import {
	BROWSER_PANE_ATTR,
	shouldHandleNavigationMouseUp,
} from "./shouldHandleNavigationMouseUp";

function makeTarget(closestResult: object | null): EventTarget {
	return {
		closest: (selector: string) =>
			selector === `[${BROWSER_PANE_ATTR}]` ? closestResult : null,
	} as unknown as EventTarget;
}

describe("shouldHandleNavigationMouseUp", () => {
	test("handles events whose target has no browser-pane ancestor", () => {
		const target = makeTarget(null);
		expect(shouldHandleNavigationMouseUp({ target })).toBe(true);
	});

	test("skips events that originate inside a browser pane (issue #4515)", () => {
		// Reproduces the bug from issue #4515: mouse buttons 4/5 routed up from a
		// focused embedded webview were being consumed by the global mouseup
		// listener and driving Superset shell navigation instead of the embedded
		// browser history. The check below is what lets the global listener
		// stay out of the way when the event came from a browser pane.
		const target = makeTarget({});
		expect(shouldHandleNavigationMouseUp({ target })).toBe(false);
	});

	test("handles events with a null target (eg synthetic events)", () => {
		expect(shouldHandleNavigationMouseUp({ target: null })).toBe(true);
	});

	test("handles events whose target does not expose closest()", () => {
		expect(
			shouldHandleNavigationMouseUp({
				target: {} as EventTarget,
			}),
		).toBe(true);
	});
});
