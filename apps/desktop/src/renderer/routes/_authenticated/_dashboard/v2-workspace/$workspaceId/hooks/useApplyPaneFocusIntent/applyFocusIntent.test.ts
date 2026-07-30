import { describe, expect, it } from "bun:test";
import {
	applyFocusIntent,
	type FocusIntentStoreState,
} from "./applyFocusIntent";

const TARGET = { workspaceId: "ws-1", tabId: "tab-1", paneId: "pane-1" };

/**
 * Store stand-in whose `setActiveTab` notifies subscribers synchronously, the
 * way the real panes store does — that re-entrancy is what caused the original
 * stack overflow.
 */
function makeStore(
	tabs: FocusIntentStoreState["tabs"] = [
		{ id: "tab-1", panes: { "pane-1": {} } },
	],
) {
	const calls: string[] = [];
	const subscribers: (() => void)[] = [];
	const state: FocusIntentStoreState = {
		tabs,
		setActiveTab: (tabId) => {
			calls.push(`setActiveTab:${tabId}`);
			for (const notify of subscribers) notify();
		},
		setActivePane: ({ paneId }) => {
			calls.push(`setActivePane:${paneId}`);
		},
	};
	return { state, calls, subscribe: (fn: () => void) => subscribers.push(fn) };
}

describe("applyFocusIntent", () => {
	it("activates the target tab and pane", () => {
		const { state, calls } = makeStore();
		let target: typeof TARGET | null = TARGET;

		const result = applyFocusIntent({
			target,
			workspaceId: "ws-1",
			state,
			isLayoutReady: true,
			clear: () => {
				target = null;
			},
		});

		expect(result).toBe("applied");
		expect(calls).toEqual(["setActiveTab:tab-1", "setActivePane:pane-1"]);
		expect(target).toBeNull();
	});

	it("does not recurse when the store notifies subscribers mid-write", () => {
		// Regression: this function runs as a store subscriber AND writes to
		// that store, so `setActiveTab` re-enters it synchronously. Clearing
		// the request BEFORE writing is what stops that re-entry from applying
		// again and recursing until the stack overflows. Re-entering once and
		// finding nothing to do is expected; applying twice is the bug.
		const { state, calls, subscribe } = makeStore();
		let target: typeof TARGET | null = TARGET;
		const results: string[] = [];

		const run = () => {
			results.push(
				applyFocusIntent({
					target,
					workspaceId: "ws-1",
					state,
					isLayoutReady: true,
					clear: () => {
						target = null;
					},
				}),
			);
		};

		subscribe(run);
		run();

		// Applied exactly once; the re-entrant call found the request cleared.
		expect(results.filter((r) => r === "applied")).toHaveLength(1);
		expect(calls).toEqual(["setActiveTab:tab-1", "setActivePane:pane-1"]);
	});

	it("ignores a request aimed at another workspace", () => {
		const { state, calls } = makeStore();
		let cleared = false;

		const result = applyFocusIntent({
			target: { ...TARGET, workspaceId: "ws-other" },
			workspaceId: "ws-1",
			state,
			isLayoutReady: true,
			clear: () => {
				cleared = true;
			},
		});

		expect(result).toBe("ignored");
		expect(calls).toEqual([]);
		// Must not consume another workspace's pending request.
		expect(cleared).toBe(false);
	});

	it("keeps the request while the layout is still loading", () => {
		const { state } = makeStore([]);
		let cleared = false;

		const result = applyFocusIntent({
			target: TARGET,
			workspaceId: "ws-1",
			state,
			isLayoutReady: false,
			clear: () => {
				cleared = true;
			},
		});

		expect(result).toBe("retry");
		expect(cleared).toBe(false);
	});

	it("keeps the request when ready is set but the store is still empty", () => {
		// The cross-workspace path files the request before the route mounts;
		// dropping it here would silently lose the switch.
		const { state } = makeStore([]);
		let cleared = false;

		const result = applyFocusIntent({
			target: TARGET,
			workspaceId: "ws-1",
			state,
			isLayoutReady: true,
			clear: () => {
				cleared = true;
			},
		});

		expect(result).toBe("retry");
		expect(cleared).toBe(false);
	});

	it("drops the request once loaded and the pane is confirmed gone", () => {
		const { state } = makeStore([{ id: "tab-other", panes: {} }]);
		let cleared = false;

		const result = applyFocusIntent({
			target: TARGET,
			workspaceId: "ws-1",
			state,
			isLayoutReady: true,
			clear: () => {
				cleared = true;
			},
		});

		expect(result).toBe("dropped");
		expect(cleared).toBe(true);
	});
});
