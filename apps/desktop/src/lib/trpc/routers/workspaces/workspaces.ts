import { mergeRouters } from "../..";
import { createCreateProcedures } from "./procedures/create";
import { createDeleteProcedures } from "./procedures/delete";
import { createGitStatusProcedures } from "./procedures/git-status";
import { createInitProcedures } from "./procedures/init";
import { createQueryProcedures } from "./procedures/query";
import { createStatusProcedures } from "./procedures/status";

/**
 * Workspaces router - manages workspace lifecycle, git operations, and status.
 *
 * Procedures are organized into logical groups:
 * - create: create, createBranchWorkspace, openWorktree
 * - delete: delete, close, canDelete
 * - query: get, getAll, getAllGrouped
 * - git-status: refreshGitStatus, getGitHubStatus, getWorktreeInfo, getWorktreesByProject
 * - status: reorder, update, setUnread
 * - init: onInitProgress, retryInit, getInitProgress, getSetupCommands
 */
export const createWorkspacesRouter = () => {
	return mergeRouters(
		createCreateProcedures(),
		createDeleteProcedures(),
		createQueryProcedures(),
		createGitStatusProcedures(),
		createStatusProcedures(),
		createInitProcedures(),
	);
};

export type WorkspacesRouter = ReturnType<typeof createWorkspacesRouter>;
