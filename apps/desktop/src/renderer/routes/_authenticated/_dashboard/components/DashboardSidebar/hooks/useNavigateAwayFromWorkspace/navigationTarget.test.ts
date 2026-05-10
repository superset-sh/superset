import { describe, expect, test } from "bun:test";
import { resolveWorkspaceRemovalNavigationTarget } from "./navigationTarget";

describe("resolveWorkspaceRemovalNavigationTarget", () => {
	test("does nothing when the removed workspace is not active", () => {
		expect(
			resolveWorkspaceRemovalNavigationTarget({
				activeWorkspaceId: "workspace-a",
				removedWorkspaceId: "workspace-b",
				orderedWorkspaceIds: ["workspace-a", "workspace-b"],
			}),
		).toBeNull();
	});

	test("chooses the next workspace in sidebar order", () => {
		expect(
			resolveWorkspaceRemovalNavigationTarget({
				activeWorkspaceId: "workspace-b",
				removedWorkspaceId: "workspace-b",
				orderedWorkspaceIds: ["workspace-a", "workspace-b", "workspace-c"],
			}),
		).toEqual({ kind: "workspace", workspaceId: "workspace-c" });
	});

	test("falls back to the previous workspace at the end of the list", () => {
		expect(
			resolveWorkspaceRemovalNavigationTarget({
				activeWorkspaceId: "workspace-c",
				removedWorkspaceId: "workspace-c",
				orderedWorkspaceIds: ["workspace-a", "workspace-b", "workspace-c"],
			}),
		).toEqual({ kind: "workspace", workspaceId: "workspace-b" });
	});

	test("skips stale and deleting workspaces", () => {
		expect(
			resolveWorkspaceRemovalNavigationTarget({
				activeWorkspaceId: "workspace-a",
				removedWorkspaceId: "workspace-a",
				orderedWorkspaceIds: [
					"workspace-a",
					"stale-workspace",
					"deleting-workspace",
					"workspace-b",
				],
				isWorkspaceValid: (workspaceId) => workspaceId !== "stale-workspace",
				isWorkspaceDeleting: (workspaceId) =>
					workspaceId === "deleting-workspace",
			}),
		).toEqual({ kind: "workspace", workspaceId: "workspace-b" });
	});

	test("uses the first valid workspace when the removed id is no longer ordered", () => {
		expect(
			resolveWorkspaceRemovalNavigationTarget({
				activeWorkspaceId: "workspace-a",
				removedWorkspaceId: "workspace-a",
				orderedWorkspaceIds: ["stale-workspace", "workspace-b"],
				isWorkspaceValid: (workspaceId) => workspaceId !== "stale-workspace",
			}),
		).toEqual({ kind: "workspace", workspaceId: "workspace-b" });
	});

	test("falls back home when no valid workspace remains", () => {
		expect(
			resolveWorkspaceRemovalNavigationTarget({
				activeWorkspaceId: "workspace-a",
				removedWorkspaceId: "workspace-a",
				orderedWorkspaceIds: ["workspace-a", "stale-workspace"],
				isWorkspaceValid: (workspaceId) => workspaceId !== "stale-workspace",
			}),
		).toEqual({ kind: "home" });
	});
});
