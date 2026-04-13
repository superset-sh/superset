import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Reproduction test for GitHub issue #3395:
 * V2 workspaces ignored the project-level default editor setting,
 * always falling back to "finder" instead of the user's saved editor
 * preference. This caused cmd+o to open the wrong app (Finder or an
 * untitled workspace in the editor instead of reusing the project's
 * configured editor).
 *
 * The root cause was that V2OpenInMenuButton did not query
 * `resolveDefaultEditor(projectId)` — it only read from per-workspace
 * local state which defaults to "finder".
 *
 * This test verifies that `resolveDefaultEditor` correctly resolves
 * the default editor from project settings, then global settings,
 * matching the behaviour the V1 OpenInMenuButton already had.
 */

const selectGetMock = mock(() => null as Record<string, unknown> | null);
const localDbMock = {
	select: mock(() => ({
		from: () => ({
			where: () => ({
				get: selectGetMock,
			}),
			get: selectGetMock,
		}),
	})),
};

mock.module("drizzle-orm", () => ({
	eq: mock(() => null),
}));

mock.module("main/lib/local-db", () => ({
	localDb: localDbMock,
}));

mock.module("@superset/local-db", () => ({
	EXTERNAL_APPS: ["finder", "vscode", "cursor", "windsurf", "zed", "sublime"],
	NON_EDITOR_APPS: ["finder", "iterm", "warp", "terminal", "ghostty"],
	projects: { id: "id", defaultApp: "defaultApp" },
	settings: { id: "id", defaultEditor: "defaultEditor" },
}));

// Stub modules the external router imports but we don't exercise
mock.module("electron", () => ({
	clipboard: { writeText: mock() },
	shell: { showItemInFolder: mock(), openExternal: mock(), openPath: mock() },
}));
mock.module("../workspaces/utils/db-helpers", () => ({
	getWorkspace: mock(),
}));
mock.module("../workspaces/utils/worktree", () => ({
	getWorkspacePath: mock(),
}));
mock.module("../..", () => ({
	publicProcedure: {
		input: () => ({ mutation: () => ({}), query: () => ({}) }),
		mutation: () => ({}),
		query: () => ({}),
	},
	router: (r: unknown) => r,
}));

const { resolveDefaultEditor } = await import("./index");

describe("resolveDefaultEditor", () => {
	beforeEach(() => {
		selectGetMock.mockReset();
		localDbMock.select.mockClear();
	});

	test("returns project default app when project has one configured", () => {
		// First call: project query returns cursor as the saved default
		// Second call: shouldn't be reached
		selectGetMock.mockReturnValueOnce({ defaultApp: "cursor" });

		const result = resolveDefaultEditor("project-123");
		expect(result).toBe("cursor");
	});

	test("falls back to global default when project has no default", () => {
		// First call: project query returns no defaultApp
		selectGetMock.mockReturnValueOnce({ defaultApp: null });
		// Second call: global settings query returns vscode
		selectGetMock.mockReturnValueOnce({ defaultEditor: "vscode" });

		const result = resolveDefaultEditor("project-456");
		expect(result).toBe("vscode");
	});

	test("returns null when neither project nor global default exists", () => {
		// First call: project query returns no defaultApp
		selectGetMock.mockReturnValueOnce({ defaultApp: null });
		// Second call: global settings returns no defaultEditor
		selectGetMock.mockReturnValueOnce(null);

		const result = resolveDefaultEditor("project-789");
		expect(result).toBeNull();
	});

	test("returns global default when no projectId is provided", () => {
		// Only one call expected: global settings query
		selectGetMock.mockReturnValueOnce({ defaultEditor: "windsurf" });

		const result = resolveDefaultEditor();
		expect(result).toBe("windsurf");
	});

	test("returns null when no projectId and no global default exists", () => {
		selectGetMock.mockReturnValueOnce(null);

		const result = resolveDefaultEditor();
		expect(result).toBeNull();
	});
});
