import { router } from "../..";
import { createBranchesRouter } from "./branches";
import { createFileContentsRouter } from "./file-contents";
import { createStagingRouter } from "./staging";
import { createStatusRouter } from "./status";

/**
 * Creates the combined changes router by merging all sub-routers.
 * This maintains the flat API structure expected by consumers.
 */
export const createChangesRouter = () => {
	const branchesRouter = createBranchesRouter();
	const statusRouter = createStatusRouter();
	const fileContentsRouter = createFileContentsRouter();
	const stagingRouter = createStagingRouter();

	return router({
		// Branch operations
		...branchesRouter._def.procedures,

		// Status operations
		...statusRouter._def.procedures,

		// File contents operations
		...fileContentsRouter._def.procedures,

		// Staging operations
		...stagingRouter._def.procedures,
	});
};
