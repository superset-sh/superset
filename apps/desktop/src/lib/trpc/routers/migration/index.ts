import {
	projects,
	v1MigrationState,
	workspaceSections,
	workspaces,
	worktrees,
} from "@superset/local-db";
import { eq, isNotNull, isNull } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const migrationStateRowSchema = z.object({
	v1Id: z.string().min(1),
	kind: z.enum(["project", "workspace"]),
	v2Id: z.string().nullable(),
	organizationId: z.string().min(1),
	status: z.enum(["success", "linked", "error", "skipped"]),
	reason: z.string().nullable().optional(),
});

export const createMigrationRouter = () => {
	return router({
		readV1Projects: publicProcedure.query(() => {
			// Only migrate pinned projects. v1's `hideProject` nulls tab_order when
			// the last workspace in a project is deleted, effectively abandoning the
			// project — don't resurrect those in v2.
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

		readV1WorkspaceSections: publicProcedure.query(() => {
			return localDb.select().from(workspaceSections).all();
		}),

		listState: publicProcedure
			.input(z.object({ organizationId: z.string().min(1) }))
			.query(({ input }) => {
				return localDb
					.select()
					.from(v1MigrationState)
					.where(eq(v1MigrationState.organizationId, input.organizationId))
					.all();
			}),

		upsertState: publicProcedure
			.input(migrationStateRowSchema)
			.mutation(({ input }) => {
				localDb
					.insert(v1MigrationState)
					.values({
						v1Id: input.v1Id,
						kind: input.kind,
						v2Id: input.v2Id,
						organizationId: input.organizationId,
						status: input.status,
						reason: input.reason ?? null,
						migratedAt: Date.now(),
					})
					.onConflictDoUpdate({
						target: [
							v1MigrationState.organizationId,
							v1MigrationState.v1Id,
							v1MigrationState.kind,
						],
						set: {
							v2Id: input.v2Id,
							status: input.status,
							reason: input.reason ?? null,
							migratedAt: Date.now(),
						},
					})
					.run();
			}),

		clearState: publicProcedure
			.input(z.object({ organizationId: z.string().min(1) }))
			.mutation(({ input }) => {
				localDb
					.delete(v1MigrationState)
					.where(eq(v1MigrationState.organizationId, input.organizationId))
					.run();
			}),

		findMigrationByOtherOrg: publicProcedure
			.input(z.object({ organizationId: z.string().min(1) }))
			.query(({ input }) => {
				const other = localDb
					.select({
						organizationId: v1MigrationState.organizationId,
						status: v1MigrationState.status,
					})
					.from(v1MigrationState)
					.where(eq(v1MigrationState.kind, "project"))
					.all()
					.find(
						(row) =>
							row.organizationId !== input.organizationId &&
							(row.status === "success" || row.status === "linked"),
					);
				return other?.organizationId ?? null;
			}),
	});
};
