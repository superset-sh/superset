import { describe, expect, test } from "bun:test";
import {
	getRelativeWorkspaceTarget,
	shouldRunWorkspaceSwitchHotkey,
} from "./useDashboardSidebarShortcuts.utils";

const workspaces = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("useDashboardSidebarShortcuts utils", () => {
	test("gets previous and next workspace targets with wrapping", () => {
		expect(getRelativeWorkspaceTarget(workspaces, "b", "previous")?.id).toBe(
			"a",
		);
		expect(getRelativeWorkspaceTarget(workspaces, "b", "next")?.id).toBe("c");
		expect(getRelativeWorkspaceTarget(workspaces, "a", "previous")?.id).toBe(
			"c",
		);
		expect(getRelativeWorkspaceTarget(workspaces, "c", "next")?.id).toBe("a");
	});

	test("returns null when the current workspace cannot be resolved", () => {
		expect(getRelativeWorkspaceTarget(workspaces, null, "next")).toBeNull();
		expect(
			getRelativeWorkspaceTarget(workspaces, "missing", "next"),
		).toBeNull();
		expect(getRelativeWorkspaceTarget([], "a", "next")).toBeNull();
	});

	test("coalesces rapid workspace switch hotkeys while allowing controlled repeats", () => {
		expect(
			shouldRunWorkspaceSwitchHotkey({
				isNavigating: true,
				now: 1_000,
				lastRunAt: Number.NEGATIVE_INFINITY,
			}),
		).toBe(false);
		expect(
			shouldRunWorkspaceSwitchHotkey({
				isNavigating: false,
				now: 1_000,
				lastRunAt: 900,
				minIntervalMs: 160,
			}),
		).toBe(false);
		expect(
			shouldRunWorkspaceSwitchHotkey({
				isNavigating: false,
				now: 1_000,
				lastRunAt: 820,
				minIntervalMs: 160,
			}),
		).toBe(true);
	});
});
