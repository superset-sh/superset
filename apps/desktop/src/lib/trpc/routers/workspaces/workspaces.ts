import { mergeRouters } from "../..";
import { createCreateProcedures } from "./procedures/create";
import { createDeleteProcedures } from "./procedures/delete";
import { createGenerateBranchNameProcedures } from "./procedures/generate-branch-name";
import { createGitStatusProcedures } from "./procedures/git-status";
import { createInitProcedures } from "./procedures/init";
import { createQueryProcedures } from "./procedures/query";
import { createSectionsProcedures } from "./procedures/sections";
import { createStatusProcedures } from "./procedures/status";

export const createWorkspacesRouter = () => {
	return mergeRouters(
		createCreateProcedures(),
		createDeleteProcedures(),
		createQueryProcedures(),
		createGitStatusProcedures(),
		createStatusProcedures(),
		createInitProcedures(),
		createSectionsProcedures(),
		createGenerateBranchNameProcedures(),
	);
};

export type WorkspacesRouter = ReturnType<typeof createWorkspacesRouter>;
