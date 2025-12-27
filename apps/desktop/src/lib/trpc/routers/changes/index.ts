import { router } from "../..";
import { createBranchesRouter } from "./branches";
import { createFileContentsRouter } from "./file-contents";
import { createGitOperationsRouter } from "./git-operations";
import { createStagingRouter } from "./staging";
import { createStatusRouter } from "./status";

export const createChangesRouter = () => {
	const branchesRouter = createBranchesRouter();
	const statusRouter = createStatusRouter();
	const fileContentsRouter = createFileContentsRouter();
	const stagingRouter = createStagingRouter();
	const gitOperationsRouter = createGitOperationsRouter();

	return router({
		// Branch operations
		...branchesRouter._def.procedures,

		// Status operations
		...statusRouter._def.procedures,

		// File contents operations
		...fileContentsRouter._def.procedures,

		// Staging operations
		...stagingRouter._def.procedures,

		// Git operations (commit, push, pull, sync, createPR)
		...gitOperationsRouter._def.procedures,
	});
};
