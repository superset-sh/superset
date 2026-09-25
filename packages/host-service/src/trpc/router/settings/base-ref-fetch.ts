import { z } from "zod";
import { hostSettings } from "../../../db/schema";
import { protectedProcedure, router } from "../../index";

/**
 * Host-wide background base-ref fetch for the Changes panel. Null (never
 * configured) means enabled. Disabling stops the recurring `git fetch` that
 * surfaces SSH approval prompts; the diff itself never depends on the fetch.
 * Stored in the single-row `host_settings` table (`id = 1`).
 */
export const baseRefFetchRouter = router({
	/** The host-wide setting. `true` when never configured. */
	get: protectedProcedure.query(({ ctx }) => {
		const row = ctx.db.select().from(hostSettings).get();
		return {
			enabled: (row?.baseRefFetchEnabled ?? 1) !== 0,
		};
	}),

	/** Set the host-wide setting, upserting the single settings row. */
	set: protectedProcedure
		.input(
			z.object({
				enabled: z.boolean(),
			}),
		)
		.mutation(({ ctx, input }) => {
			ctx.db
				.insert(hostSettings)
				.values({
					id: 1,
					baseRefFetchEnabled: input.enabled ? 1 : 0,
				})
				.onConflictDoUpdate({
					target: hostSettings.id,
					set: {
						baseRefFetchEnabled: input.enabled ? 1 : 0,
					},
				})
				.run();
			return { success: true as const };
		}),
});
