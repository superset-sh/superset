// Types

// Branch utilities
export {
	branchExistsOnRemote,
	checkoutBranch,
	detectBaseBranch,
	fetchDefaultBranch,
	generateBranchName,
	getCurrentBranch,
	getDefaultBranch,
	hasOriginRemote,
	listBranches,
	refExistsLocally,
	refreshDefaultBranch,
	sanitizeGitError,
} from "./branch";

// Shell environment utilities
export {
	checkGitLfsAvailable,
	clearShellEnvCache,
	getGitEnv,
	getShellEnvironment,
} from "./shell-env";
// Status utilities
export {
	checkBranchCheckoutSafety,
	checkNeedsRebase,
	getStatusNoLock,
	hasUncommittedChanges,
	hasUnpushedCommits,
	safeCheckoutBranch,
} from "./status";
export type {
	BranchExistsResult,
	CheckoutSafetyResult,
	ExecFileException,
	StatusResult,
} from "./types";
// Worktree utilities
export {
	createWorktree,
	getGitRoot,
	listWorktrees,
	removeWorktree,
	worktreeExists,
} from "./worktree";
