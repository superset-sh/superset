/**
 * Security module for changes routers.
 *
 * This module provides:
 * - Path validation with symlink escape protection
 * - Secure filesystem wrappers
 * - Worktree registration checks
 *
 * All filesystem operations in the changes routers should go through
 * this module to ensure consistent security checks.
 */

export {
	gitCheckoutFile,
	gitStageAll,
	gitStageFile,
	gitSwitchBranch,
	gitUnstageAll,
	gitUnstageFile,
} from "./git-commands";
export {
	assertRegisteredWorktree,
	assertValidGitPath,
	getRegisteredWorktree,
	PathValidationError,
	type PathValidationErrorCode,
	type ResolveSecurePathOptions,
	resolveSecurePath,
} from "./path-validation";
export { secureFs } from "./secure-fs";
