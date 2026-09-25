import { z } from "zod";
import type { HostDb } from "../../../db/db";
import { hostSettings } from "../../../db/schema";
import { protectedProcedure, router } from "../../index";

/** Read the stored key, if any. Never exposed over tRPC — server-side only. */
export function readOllamaApiKey(db: HostDb): string | null {
	const row = db.select().from(hostSettings).get();
	return row?.ollamaApiKey ?? null;
}

/**
 * Ollama Cloud API key for the Usage page quota meter. The key itself never
 * leaves the host: reads report configured/not only, writes upsert it blind.
 * Stored in the single-row `host_settings` table (`id = 1`).
 */
export const ollamaRouter = router({
	/** Whether a key is stored. Never returns the key itself. */
	get: protectedProcedure.query(({ ctx }) => {
		const row = ctx.db.select().from(hostSettings).get();
		return {
			configured: (row?.ollamaApiKey ?? null) !== null,
		};
	}),

	/** Store (or replace) the key. Empty values are rejected. */
	setKey: protectedProcedure
		.input(
			z.object({
				key: z.string().min(1).max(500),
			}),
		)
		.mutation(({ ctx, input }) => {
			ctx.db
				.insert(hostSettings)
				.values({
					id: 1,
					ollamaApiKey: input.key,
				})
				.onConflictDoUpdate({
					target: hostSettings.id,
					set: {
						ollamaApiKey: input.key,
					},
				})
				.run();
			return { success: true as const };
		}),

	/** Forget the stored key. The Usage section hides again. */
	clearKey: protectedProcedure.mutation(({ ctx }) => {
		ctx.db
			.insert(hostSettings)
			.values({
				id: 1,
				ollamaApiKey: null,
			})
			.onConflictDoUpdate({
				target: hostSettings.id,
				set: {
					ollamaApiKey: null,
				},
			})
			.run();
		return { success: true as const };
	}),
});
