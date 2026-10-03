import { beforeEach, describe, expect, it } from "bun:test";
import { useAutomationFailuresStore } from "./store";

describe("automation failures store", () => {
	beforeEach(() => {
		useAutomationFailuresStore.setState({ lastSeenFailureAt: 0 });
	});

	it("advances the watermark to the newest acknowledged failure", () => {
		useAutomationFailuresStore.getState().markFailuresSeen(200);
		expect(useAutomationFailuresStore.getState().lastSeenFailureAt).toBe(200);
	});

	it("is monotonic and ignores older acknowledgements", () => {
		const store = useAutomationFailuresStore.getState();
		store.markFailuresSeen(200);
		store.markFailuresSeen(100);
		expect(useAutomationFailuresStore.getState().lastSeenFailureAt).toBe(200);
		store.markFailuresSeen(300);
		expect(useAutomationFailuresStore.getState().lastSeenFailureAt).toBe(300);
	});

	it("keeps the same state reference when nothing changes", () => {
		const store = useAutomationFailuresStore.getState();
		store.markFailuresSeen(200);
		const before = useAutomationFailuresStore.getState();
		store.markFailuresSeen(200);
		expect(useAutomationFailuresStore.getState()).toBe(before);
	});
});
