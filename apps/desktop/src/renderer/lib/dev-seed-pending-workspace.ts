/**
 * Dev-only utility to seed fake pending workspaces for UI development.
 * Call from DevTools console: `window.__seedPendingWorkspace()`
 *
 * Requires the collections to be available — only works after the app
 * is fully loaded and the CollectionsProvider has initialized.
 */

// This will be wired up from the layout or a dev component.
// The actual seeding happens via the collections API.

export interface SeedOptions {
	projectId: string;
	status?: "creating" | "failed" | "succeeded";
	name?: string;
	branchName?: string;
	error?: string;
}

export function createMockPendingWorkspace(options: SeedOptions) {
	return {
		id: crypto.randomUUID(),
		projectId: options.projectId,
		name: options.name ?? "Mock workspace — fix the login bug",
		branchName: options.branchName ?? "fix-the-login-bug",
		prompt: "fix the login bug",
		compareBaseBranch: null,
		runSetupScript: true,
		linkedIssues: [],
		linkedPR: null,
		hostTarget: { kind: "local" as const },
		attachmentCount: 0,
		status: options.status ?? "creating",
		error: options.error ?? null,
		workspaceId: null,
		initialCommands: null,
		createdAt: new Date(),
	};
}
