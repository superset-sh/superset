import { beforeEach, describe, expect, it } from "bun:test";
import { usePaneFocusIntent } from "./pane-focus-intent";

const TARGET = { workspaceId: "ws-1", tabId: "tab-1", paneId: "pane-1" };

describe("pane focus intent", () => {
	beforeEach(() => {
		usePaneFocusIntent.setState({ tick: 0, target: null });
	});

	it("bumps the tick so an identical repeat request still fires", () => {
		// Consumers compare ticks, not targets. Ctrl+Tab back to the same pane
		// twice in a row has to work.
		const ticks: number[] = [];
		const unsubscribe = usePaneFocusIntent.subscribe((state, previous) => {
			if (state.tick !== previous.tick) ticks.push(state.tick);
		});

		usePaneFocusIntent.getState().request(TARGET);
		usePaneFocusIntent.getState().request(TARGET);
		unsubscribe();

		expect(ticks).toEqual([1, 2]);
	});

	it("clears the target without disturbing the tick", () => {
		usePaneFocusIntent.getState().request(TARGET);
		usePaneFocusIntent.getState().clear();

		const { target, tick } = usePaneFocusIntent.getState();
		expect(target).toBeNull();
		expect(tick).toBe(1);
	});

	it("replaces a pending target rather than queueing", () => {
		const second = { ...TARGET, paneId: "pane-2" };
		usePaneFocusIntent.getState().request(TARGET);
		usePaneFocusIntent.getState().request(second);

		expect(usePaneFocusIntent.getState().target).toEqual(second);
	});
});

// The non-recursion guarantee is a property of how the consumer applies a
// request, not of this store — see applyFocusIntent.test.ts.
