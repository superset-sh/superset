/**
 * Dev-only utility to seed fake pending workspaces for UI development.
 *
 * Usage in DevTools console:
 *   __seedPendingWorkspace("PROJECT_ID")
 *   __seedPendingWorkspace("PROJECT_ID", "failed")
 *   __seedPendingWorkspace("PROJECT_ID", "succeeded")
 *   __seedAllPendingStates("PROJECT_ID")   // one of each state
 *   __clearPendingWorkspaces()
 *
 * Quick copy-paste with your project ID:
 *   __seedAllPendingStates("1c99c8eb-1b31-4f04-9ac4-61a2760c74b6")
 */

export interface SeedOptions {
	projectId: string;
	status?: "creating" | "failed" | "succeeded";
	name?: string;
	branchName?: string;
	error?: string;
	workspaceId?: string;
}

const MOCK_NAMES: Record<string, { name: string; branch: string }> = {
	creating: { name: "Add dark mode support", branch: "add-dark-mode-support" },
	failed: {
		name: "Fix authentication flow",
		branch: "fix-authentication-flow",
	},
	succeeded: {
		name: "Refactor API endpoints",
		branch: "refactor-api-endpoints",
	},
};

export function createMockPendingWorkspace(options: SeedOptions) {
	const defaults = MOCK_NAMES[options.status ?? "creating"];
	return {
		id: crypto.randomUUID(),
		projectId: options.projectId,
		name: options.name ?? defaults.name,
		branchName: options.branchName ?? defaults.branch,
		prompt: options.name ?? defaults.name,
		compareBaseBranch: null,
		runSetupScript: true,
		linkedIssues: [],
		linkedPR: null,
		hostTarget: { kind: "local" as const },
		attachmentCount: 0,
		status: options.status ?? "creating",
		error:
			options.status === "failed"
				? (options.error ?? "Cloud API returned no row")
				: null,
		workspaceId:
			options.status === "succeeded"
				? (options.workspaceId ?? crypto.randomUUID())
				: null,
		initialCommands: null,
		createdAt: new Date(),
	};
}
