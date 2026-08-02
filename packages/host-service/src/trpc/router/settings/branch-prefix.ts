import {
	BRANCH_PREFIX_MODES,
	type BranchPrefixMode,
} from "@superset/shared/workspace-launch";
import { z } from "zod";
import { hostSettings } from "../../../db/schema";
import { getStrictShellEnvironment } from "../../../terminal/clean-shell-env";
import { gitIdentityTask } from "../../../workers/tasks/git";
import { protectedProcedure, router } from "../../index";
import { offLoop } from "../../off-loop";

/**
 * Host-wide branch-prefix default. Projects without their own override fall
 * back to this. Stored in the single-row `host_settings` table (`id = 1`).
 */
export const branchPrefixRouter = router({
	/** The host-wide default. `none` when never configured. */
	get: protectedProcedure.query(({ ctx }) => {
		const row = ctx.db.select().from(hostSettings).get();
		return {
			mode: (row?.branchPrefixMode ?? "none") satisfies BranchPrefixMode,
			customPrefix: row?.branchPrefixCustom ?? null,
		};
	}),

	/** Set the host-wide default, upserting the single settings row. */
	set: protectedProcedure
		.input(
			z.object({
				mode: z.enum(BRANCH_PREFIX_MODES),
				customPrefix: z.string().nullable().optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			ctx.db
				.insert(hostSettings)
				.values({
					id: 1,
					branchPrefixMode: input.mode,
					branchPrefixCustom: input.customPrefix ?? null,
				})
				.onConflictDoUpdate({
					target: hostSettings.id,
					set: {
						branchPrefixMode: input.mode,
						branchPrefixCustom: input.customPrefix ?? null,
					},
				})
				.run();
			return { success: true as const };
		}),

	/**
	 * Git identity for the settings preview — lets the UI show what the
	 * `author`/`github` modes would actually resolve to.
	 */
	gitInfo: protectedProcedure.query(
		offLoop({
			task: gitIdentityTask,
			prepare: async () => ({
				shellEnv: await getStrictShellEnvironment().catch(
					() => process.env as Record<string, string>,
				),
			}),
		}),
	),
});
