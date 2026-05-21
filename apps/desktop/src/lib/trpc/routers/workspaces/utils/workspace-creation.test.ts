import { beforeEach, describe, expect, it, mock } from "bun:test";

const insertValuesMock = mock(() => ({
	returning: () => ({
		get: () => ({ id: "workspace-1" }),
	}),
}));

const insertMock = mock(() => ({
	values: insertValuesMock,
}));

mock.module("main/lib/local-db", () => ({
	localDb: {
		insert: insertMock,
	},
}));

mock.module("./db-helpers", () => ({
	activateProject: mock(() => {}),
	getMaxProjectChildTabOrder: mock(() => 0),
	setLastActiveWorkspace: mock(() => {}),
	touchWorkspace: mock(() => {}),
	updateActiveWorkspaceIfRemoved: mock(() => {}),
}));

const { createWorkspaceFromWorktree } = await import("./workspace-creation");

describe("createWorkspaceFromWorktree", () => {
	beforeEach(() => {
		insertMock.mockClear();
		insertValuesMock.mockClear();
	});

	// Reproduces #4798 — the orphaned-worktree path in procedures/create.ts
	// calls createWorkspaceFromWorktree({ name: input.name ?? branch }) and
	// then attemptWorkspaceAutoRenameFromPrompt. Auto-rename skips because
	// isUnnamed defaults to false in the DB. createWorkspaceFromWorktree
	// must propagate an isUnnamed flag so callers can mark an auto-generated
	// name as renameable.
	it("propagates isUnnamed=true so auto-rename can run for auto-named workspaces", () => {
		createWorkspaceFromWorktree({
			projectId: "project-1",
			worktreeId: "worktree-1",
			branch: "feat/auto-named-branch",
			name: "feat/auto-named-branch",
			isUnnamed: true,
		});

		expect(insertValuesMock).toHaveBeenCalledTimes(1);
		const inserted = insertValuesMock.mock.calls[0]?.[0] as Record<
			string,
			unknown
		>;
		expect(inserted.isUnnamed).toBe(true);
	});

	it("sets isUnnamed=false when the caller provided a real name", () => {
		createWorkspaceFromWorktree({
			projectId: "project-1",
			worktreeId: "worktree-1",
			branch: "feat/branch",
			name: "User-provided name",
			isUnnamed: false,
		});

		expect(insertValuesMock).toHaveBeenCalledTimes(1);
		const inserted = insertValuesMock.mock.calls[0]?.[0] as Record<
			string,
			unknown
		>;
		expect(inserted.isUnnamed).toBe(false);
	});

	it("defaults isUnnamed to false when the flag is omitted", () => {
		createWorkspaceFromWorktree({
			projectId: "project-1",
			worktreeId: "worktree-1",
			branch: "feat/branch",
			name: "feat/branch",
		});

		expect(insertValuesMock).toHaveBeenCalledTimes(1);
		const inserted = insertValuesMock.mock.calls[0]?.[0] as Record<
			string,
			unknown
		>;
		expect(inserted.isUnnamed).toBe(false);
	});
});
