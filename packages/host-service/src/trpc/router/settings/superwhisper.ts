import { eq } from "drizzle-orm";
import { z } from "zod";
import { hostSettings } from "../../../db/schema";
import {
	type SuperwhisperAdapter,
	superwhisper,
} from "../../../dictation/superwhisper";
import { protectedProcedure, router } from "../../index";
import { dictationTrpcError } from "../dictation/dictation";

export function createSuperwhisperSettingsRouter(
	adapter: Pick<SuperwhisperAdapter, "status" | "ensureMode">,
) {
	return router({
		get: protectedProcedure.query(async ({ ctx }) => {
			const row = ctx.db
				.select({ enabled: hostSettings.superwhisperEnabled })
				.from(hostSettings)
				.where(eq(hostSettings.id, 1))
				.get();
			return { enabled: row?.enabled ?? false, ...(await adapter.status()) };
		}),
		set: protectedProcedure
			.input(z.object({ enabled: z.boolean() }))
			.mutation(async ({ ctx, input }) => {
				try {
					if (input.enabled) await adapter.ensureMode();
					ctx.db
						.insert(hostSettings)
						.values({ id: 1, superwhisperEnabled: input.enabled })
						.onConflictDoUpdate({
							target: hostSettings.id,
							set: { superwhisperEnabled: input.enabled },
						})
						.run();
					return {
						enabled: input.enabled,
						...(await adapter
							.status()
							.catch(() => ({ installed: false, modeReady: false }))),
					};
				} catch (error) {
					throw dictationTrpcError(error);
				}
			}),
	});
}

export const superwhisperSettingsRouter =
	createSuperwhisperSettingsRouter(superwhisper);
