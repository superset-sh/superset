import { describe, expect, it, mock } from "bun:test";
import { copiedIndicatorStore } from "./copiedIndicatorStore";

describe("copiedIndicatorStore", () => {
	it("bumps the count for the notified pane only", () => {
		const unsubA = copiedIndicatorStore.subscribe("pane-a", () => {});
		const unsubB = copiedIndicatorStore.subscribe("pane-b", () => {});

		copiedIndicatorStore.notify("pane-a");

		expect(copiedIndicatorStore.getCount("pane-a")).toBe(1);
		expect(copiedIndicatorStore.getCount("pane-b")).toBe(0);
		unsubA();
		unsubB();
	});

	it("notifies every listener on the pane", () => {
		const first = mock(() => {});
		const second = mock(() => {});
		const unsubFirst = copiedIndicatorStore.subscribe("pane-c", first);
		const unsubSecond = copiedIndicatorStore.subscribe("pane-c", second);

		copiedIndicatorStore.notify("pane-c");

		expect(first).toHaveBeenCalledTimes(1);
		expect(second).toHaveBeenCalledTimes(1);
		unsubFirst();
		unsubSecond();
	});

	it("stops notifying an unsubscribed listener", () => {
		const listener = mock(() => {});
		const unsub = copiedIndicatorStore.subscribe("pane-d", listener);
		unsub();

		copiedIndicatorStore.notify("pane-d");

		expect(listener).not.toHaveBeenCalled();
	});

	it("forgets a pane once its last listener goes, so closed panes leak nothing", () => {
		const unsub = copiedIndicatorStore.subscribe("pane-e", () => {});
		copiedIndicatorStore.notify("pane-e");
		expect(copiedIndicatorStore.getCount("pane-e")).toBe(1);

		unsub();

		expect(copiedIndicatorStore.getCount("pane-e")).toBe(0);
	});
});
