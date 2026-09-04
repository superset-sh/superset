import { describe, expect, it } from "bun:test";
import {
	getVisibleSidebarWorkspaces,
	isAutoIncludedLocalMainWorkspace,
} from "./sidebarVisibility";

const gate = {
	localStateWorkspaceIds: new Set<string>(),
	sidebarProjectIds: new Set(["p1"]),
	machineId: "machine-local",
};

describe("isAutoIncludedLocalMainWorkspace", () => {
	it("auto-includes this device's row-less main under a sidebar project", () => {
		expect(
			isAutoIncludedLocalMainWorkspace(
				{ id: "main-local", hostId: "machine-local", projectId: "p1" },
				gate,
			),
		).toBe(true);
	});

	it("does not auto-include a remote host's main — remote surfacing is worktrees and sessions only (#7100)", () => {
		// Every online host has a main for every project it cloned; auto-including
		// those would put a second "main" row under each project per host. Remote
		// mains stay opt-in via an explicit placement row (Workspaces → Pin).
		expect(
			isAutoIncludedLocalMainWorkspace(
				{ id: "main-remote", hostId: "machine-remote", projectId: "p1" },
				gate,
			),
		).toBe(false);
	});

	it("does not auto-include a main whose project is not in the sidebar", () => {
		expect(
			isAutoIncludedLocalMainWorkspace(
				{ id: "main-local", hostId: "machine-local", projectId: "p2" },
				gate,
			),
		).toBe(false);
	});

	it("defers to the explicit row once one exists (hidden tombstone or pin)", () => {
		expect(
			isAutoIncludedLocalMainWorkspace(
				{ id: "main-local", hostId: "machine-local", projectId: "p1" },
				{ ...gate, localStateWorkspaceIds: new Set(["main-local"]) },
			),
		).toBe(false);
	});

	it("never auto-includes a project-less workspace", () => {
		expect(
			isAutoIncludedLocalMainWorkspace(
				{ id: "sess", hostId: "machine-local", projectId: null },
				gate,
			),
		).toBe(false);
	});
});

describe("getVisibleSidebarWorkspaces", () => {
	it("drops hidden rows regardless of which host owns the workspace", () => {
		const rows = [
			{ id: "local-visible", hostId: "machine-local", isHidden: false },
			{ id: "local-hidden", hostId: "machine-local", isHidden: true },
			{ id: "remote-visible", hostId: "machine-remote", isHidden: false },
			{ id: "remote-hidden", hostId: "machine-remote", isHidden: true },
		];

		expect(getVisibleSidebarWorkspaces(rows).map((row) => row.id)).toEqual([
			"local-visible",
			"remote-visible",
		]);
	});
});
