import { describe, expect, test } from "bun:test";
import { getDashboardSidebarWorkspaceIconDisplay } from "./getDashboardSidebarWorkspaceIconDisplay";

describe("getDashboardSidebarWorkspaceIconDisplay", () => {
	test("returns the workspace icon with no overlay when idle", () => {
		expect(
			getDashboardSidebarWorkspaceIconDisplay({
				creationStatus: undefined,
				workspaceStatus: null,
			}),
		).toEqual({ primary: "icon", statusOverlay: null });
	});

	test("returns the failed indicator when workspace creation failed", () => {
		expect(
			getDashboardSidebarWorkspaceIconDisplay({
				creationStatus: "failed",
				workspaceStatus: null,
			}),
		).toEqual({ primary: "creation-failed", statusOverlay: null });
	});

	test("returns the creating spinner while a workspace is being created", () => {
		expect(
			getDashboardSidebarWorkspaceIconDisplay({
				creationStatus: "creating",
				workspaceStatus: null,
			}),
		).toEqual({ primary: "creating", statusOverlay: null });
	});

	test("shows the green review dot over the workspace icon", () => {
		expect(
			getDashboardSidebarWorkspaceIconDisplay({
				creationStatus: undefined,
				workspaceStatus: "review",
			}),
		).toEqual({ primary: "icon", statusOverlay: "review" });
	});

	test("shows the red permission dot over the workspace icon", () => {
		expect(
			getDashboardSidebarWorkspaceIconDisplay({
				creationStatus: undefined,
				workspaceStatus: "permission",
			}),
		).toEqual({ primary: "icon", statusOverlay: "permission" });
	});

	// Reproduces https://github.com/superset-sh/superset/issues/4305 — when a
	// workspace's agent is "working", the sidebar item used to keep its primary
	// icon and overlay an amber in-progress dot. The component currently
	// replaces the icon with an ASCII spinner and hides the dot, leaving the
	// user with a loading indicator and no per-status colour cue.
	test("keeps the workspace icon and shows the amber dot while an agent is working", () => {
		expect(
			getDashboardSidebarWorkspaceIconDisplay({
				creationStatus: undefined,
				workspaceStatus: "working",
			}),
		).toEqual({ primary: "icon", statusOverlay: "working" });
	});

	test("creation status takes precedence over workspace status", () => {
		expect(
			getDashboardSidebarWorkspaceIconDisplay({
				creationStatus: "preparing",
				workspaceStatus: "working",
			}),
		).toEqual({ primary: "creating", statusOverlay: null });
	});
});
