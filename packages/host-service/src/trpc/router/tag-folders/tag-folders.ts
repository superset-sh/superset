import {
	tagFolderScopeInputSchema,
	workspaceTagInputSchema,
} from "@superset/shared/workspace-tags";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	deleteTagFolderSetting,
	getAllTagFolderSettings,
	hasTagFolderScope,
	upsertTagFolderSetting,
} from "../../../tag-folders";
import { protectedProcedure, router } from "../../index";

function assertScopeExists(
	db: Parameters<typeof hasTagFolderScope>[0],
	scope: string,
): void {
	if (hasTagFolderScope(db, scope)) return;
	throw new TRPCError({
		code: "NOT_FOUND",
		message: `Tag folder scope not found: ${scope}`,
	});
}

/**
 * Tag-folder presentation, keyed by scope: a project id, or the Sessions
 * lane's sentinel. Its own router rather than procedures on `project`,
 * because the Sessions lane has no project to scope them to.
 */
export const tagFoldersRouter = router({
	/** The caller's own folders, plus any customised before folders had owners. */
	list: protectedProcedure.query(({ ctx }) =>
		getAllTagFolderSettings(ctx.db, ctx.userId),
	),

	/** Merge-upsert one folder's presentation. Creates the row on first use. */
	upsert: protectedProcedure
		.input(
			z.object({
				scope: tagFolderScopeInputSchema,
				tag: workspaceTagInputSchema,
				displayName: z.string().min(1).max(200).nullish(),
				color: z.string().max(50).nullish(),
				tabOrder: z.number().int().nullish(),
			}),
		)
		.mutation(({ ctx, input }) => {
			assertScopeExists(ctx.db, input.scope);
			const settings = upsertTagFolderSetting(
				{ db: ctx.db, eventBus: ctx.eventBus, userId: ctx.userId },
				input.scope,
				input.tag,
				{
					...(input.displayName !== undefined
						? { displayName: input.displayName }
						: {}),
					...(input.color !== undefined ? { color: input.color } : {}),
					...(input.tabOrder !== undefined ? { tabOrder: input.tabOrder } : {}),
				},
			);
			if (settings === undefined) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Validated tag failed normalization",
				});
			}
			return { tagSettings: settings };
		}),

	/** Drop one folder's presentation row (folder deletion). Idempotent. */
	delete: protectedProcedure
		.input(
			z.object({
				scope: tagFolderScopeInputSchema,
				tag: workspaceTagInputSchema,
			}),
		)
		.mutation(({ ctx, input }) => {
			assertScopeExists(ctx.db, input.scope);
			const settings = deleteTagFolderSetting(
				{ db: ctx.db, eventBus: ctx.eventBus, userId: ctx.userId },
				input.scope,
				input.tag,
			);
			if (settings === undefined) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Validated tag failed normalization",
				});
			}
			return { tagSettings: settings };
		}),
});
