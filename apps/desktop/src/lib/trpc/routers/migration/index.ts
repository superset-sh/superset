import { projects, workspaces, worktrees } from "@superset/local-db";
import { isNotNull, isNull } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { publicProcedure, router } from "../..";

export const createMigrationRouter = () => {
	return router({
		readV1Projects: publicProcedure.query(() => {
			// Only surface pinned projects. v1's `hideProject` nulls tab_order
			// when the last workspace in a project is deleted, effectively
			// abandoning the project — don't resurrect those in v2.
			return localDb
				.select()
				.from(projects)
				.where(isNotNull(projects.tabOrder))
				.all();
		}),

		readV1Workspaces: publicProcedure.query(() => {
			return localDb
				.select()
				.from(workspaces)
				.where(isNull(workspaces.deletingAt))
				.all();
		}),

		readV1Worktrees: publicProcedure.query(() => {
			return localDb.select().from(worktrees).all();
		}),
	});
};
