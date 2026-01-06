/**
 * Workspace initialization progress types.
 * Used for streaming progress updates during workspace creation.
 */

export type WorkspaceInitStep =
	| "pending"
	| "syncing" // Syncing with remote
	| "verifying" // Verifying base branch exists
	| "fetching" // Fetching latest changes
	| "creating_worktree" // Creating git worktree
	| "copying_config" // Copying .superset configuration
	| "finalizing" // Final DB operations
	| "ready"
	| "failed";

export interface WorkspaceInitProgress {
	workspaceId: string;
	projectId: string;
	step: WorkspaceInitStep;
	message: string;
	error?: string;
}

export const INIT_STEP_MESSAGES: Record<WorkspaceInitStep, string> = {
	pending: "Preparing...",
	syncing: "Syncing with remote...",
	verifying: "Verifying base branch...",
	fetching: "Fetching latest changes...",
	creating_worktree: "Creating git worktree...",
	copying_config: "Copying configuration...",
	finalizing: "Finalizing setup...",
	ready: "Ready",
	failed: "Failed",
};

/**
 * Order of steps for UI progress display.
 * Used to show completed/current/pending steps in the progress view.
 */
export const INIT_STEP_ORDER: WorkspaceInitStep[] = [
	"pending",
	"syncing",
	"verifying",
	"fetching",
	"creating_worktree",
	"copying_config",
	"finalizing",
	"ready",
];

/**
 * Get the index of a step in the progress order.
 * Returns -1 for "failed" since it's not part of the normal flow.
 */
export function getStepIndex(step: WorkspaceInitStep): number {
	if (step === "failed") return -1;
	return INIT_STEP_ORDER.indexOf(step);
}

/**
 * Check if a step is complete based on the current step.
 */
export function isStepComplete(
	step: WorkspaceInitStep,
	currentStep: WorkspaceInitStep,
): boolean {
	if (currentStep === "failed") return false;
	const stepIndex = getStepIndex(step);
	const currentIndex = getStepIndex(currentStep);
	return stepIndex < currentIndex;
}
