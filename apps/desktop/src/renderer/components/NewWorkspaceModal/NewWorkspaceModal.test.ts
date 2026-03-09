import { describe, expect, test } from "bun:test";
import { WORKSPACE_MODAL_TABS } from "./NewWorkspaceModalDraftContext";

describe("NewWorkspaceModal tabs", () => {
	test("includes worktrees tab so users can import existing git worktrees", () => {
		// Regression from #2295: the "Worktrees" import option was removed during a UI
		// refactor of the New Workspace modal. Users previously could click "+" on a
		// workspace in the sidebar, select "Worktree", and import existing git worktrees.
		// After the refactor, only "Prompt", "Issues", "Pull requests", and "Branches"
		// were present — the "Worktrees" tab was gone.
		expect(WORKSPACE_MODAL_TABS).toContain("worktrees");
	});
});
