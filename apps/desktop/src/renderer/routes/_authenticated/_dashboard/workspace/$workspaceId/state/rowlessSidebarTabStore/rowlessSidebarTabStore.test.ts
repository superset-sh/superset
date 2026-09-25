import { beforeEach, describe, expect, it } from "bun:test";
import { useRowlessSidebarTabStore } from "./rowlessSidebarTabStore";

describe("useRowlessSidebarTabStore", () => {
	beforeEach(() => {
		useRowlessSidebarTabStore.setState({ tabs: {} });
	});

	it("clears one workspace's entry and leaves the others", () => {
		const { setTab, clearTab } = useRowlessSidebarTabStore.getState();
		setTab("a", "files");
		setTab("b", "review");

		clearTab("a");

		expect(useRowlessSidebarTabStore.getState().tabs).toEqual({ b: "review" });
	});

	it("leaves state untouched when the workspace has no entry", () => {
		useRowlessSidebarTabStore.getState().setTab("a", "files");
		const before = useRowlessSidebarTabStore.getState().tabs;

		useRowlessSidebarTabStore.getState().clearTab("missing");

		expect(useRowlessSidebarTabStore.getState().tabs).toBe(before);
	});
});
