// Types
export type {
	BranchExistsResult,
	CheckoutSafetyResult,
	ExecFileException,
	StatusResult,
} from "./types";

// Shell environment utilities
export {
	checkGitLfsAvailable,
	clearShellEnvCache,
	getGitEnv,
	getShellEnvironment,
} from "./shell-env";

// Worktree utilities
export {
	createWorktree,
	getGitRoot,
	listWorktrees,
	removeWorktree,
	worktreeExists,
} from "./worktree";

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

// Status utilities
export {
	checkBranchCheckoutSafety,
	checkNeedsRebase,
	getStatusNoLock,
	hasUncommittedChanges,
	hasUnpushedCommits,
	safeCheckoutBranch,
} from "./status";
