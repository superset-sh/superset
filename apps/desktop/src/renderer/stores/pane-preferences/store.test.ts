import { beforeEach, describe, expect, it } from "bun:test";
import { usePanePreferencesStore } from "./store";

beforeEach(() => {
	// Reset persisted localStorage entry so each test starts clean.
	if (typeof localStorage !== "undefined") {
		localStorage.removeItem("pane-preferences");
	}
	usePanePreferencesStore.setState({ focusFollowsMouse: false });
});

describe("pane-preferences store", () => {
	it("defaults focusFollowsMouse to false", () => {
		expect(usePanePreferencesStore.getState().focusFollowsMouse).toBe(false);
	});

	it("setFocusFollowsMouse(true) flips the value", () => {
		usePanePreferencesStore.getState().setFocusFollowsMouse(true);
		expect(usePanePreferencesStore.getState().focusFollowsMouse).toBe(true);
	});

	it("setFocusFollowsMouse(false) flips back", () => {
		usePanePreferencesStore.getState().setFocusFollowsMouse(true);
		usePanePreferencesStore.getState().setFocusFollowsMouse(false);
		expect(usePanePreferencesStore.getState().focusFollowsMouse).toBe(false);
	});
});
