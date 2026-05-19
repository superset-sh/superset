import { describe, expect, it } from "bun:test";
import { resolveSidebarWorkspaceCloseAction } from "./resolveSidebarWorkspaceCloseAction";

describe("resolveSidebarWorkspaceCloseAction", () => {
	// Regression for issue #4415 — a workspace whose host-side create mutation
	// never resolved left the sidebar row pinned to "creating" with the close
	// button wired to the workspace delete dialog (which can't run because no
	// cloud workspace exists yet). The close button must instead dismiss the
	// in-flight entry from the local store.
	it("dismisses creating entries", () => {
		expect(resolveSidebarWorkspaceCloseAction("creating")).toBe("dismiss");
	});

	it("dismisses failed entries", () => {
		expect(resolveSidebarWorkspaceCloseAction("failed")).toBe("dismiss");
	});

	it("dismisses preparing entries", () => {
		expect(resolveSidebarWorkspaceCloseAction("preparing")).toBe("dismiss");
	});

	it("dismisses generating-branch entries", () => {
		expect(resolveSidebarWorkspaceCloseAction("generating-branch")).toBe(
			"dismiss",
		);
	});

	it("opens the delete dialog for synced workspaces", () => {
		expect(resolveSidebarWorkspaceCloseAction(undefined)).toBe(
			"open-delete-dialog",
		);
	});
});
