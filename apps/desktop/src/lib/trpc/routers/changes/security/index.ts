/**
 * Security module for changes routers.
 *
 * Security model:
 * - PRIMARY: Worktree must be registered in localDb
 * - SECONDARY: Paths validated for traversal attempts
 *
 * See path-validation.ts header for full threat model.
 */

export {
	gitCheckoutFile,
	gitDiscardAllStaged,
	gitDiscardAllUnstaged,
	gitStageAll,
	gitStageFile,
	gitStageFiles,
	gitStash,
	gitStashIncludeUntracked,
	gitStashPop,
	gitSwitchBranch,
	gitUnstageAll,
	gitUnstageFile,
	gitUnstageFiles,
} from "./git-commands";

export {
	assertRegisteredWorktree,
	assertValidGitPath,
	getRegisteredWorktree,
	PathValidationError,
	type PathValidationErrorCode,
	resolvePathInWorktree,
	type ValidatePathOptions,
	validateRelativePath,
} from "./path-validation";

export { secureFs } from "./secure-fs";
