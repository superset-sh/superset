import { observable } from "@trpc/server/observable";
import {
	getUsageCollector,
	USAGE_UPDATED_EVENT,
} from "main/lib/usage/usage-collector";
import {
	getUsageDisplaySettings,
	updateUsageDisplaySettings,
} from "main/lib/usage/usage-settings";
import type { ProviderSnapshot } from "main/lib/usage/usage-snapshot";
import { z } from "zod";
import { publicProcedure, router } from "..";

const updateSettingsInputSchema = z.object({
	showSidebarBadge: z.boolean().optional(),
	showTrayPercentage: z.boolean().optional(),
	notifyAt80Pct: z.boolean().optional(),
	notifyAt95Pct: z.boolean().optional(),
});

export const createUsageRouter = () => {
	return router({
		getSnapshot: publicProcedure.query(() =>
			getUsageCollector().getSnapshots(),
		),

		refresh: publicProcedure.mutation(() => getUsageCollector().refresh()),

		subscribe: publicProcedure.subscription(() => {
			return observable<ProviderSnapshot[]>((emit) => {
				const collector = getUsageCollector();
				// Push the cached reading immediately so a late subscriber isn't blank
				// until the next poll cycle.
				emit.next(collector.getSnapshots());

				const handler = (snapshots: ProviderSnapshot[]) => emit.next(snapshots);
				collector.on(USAGE_UPDATED_EVENT, handler);
				return () => {
					collector.off(USAGE_UPDATED_EVENT, handler);
				};
			});
		}),

		getSettings: publicProcedure.query(() => getUsageDisplaySettings()),

		updateSettings: publicProcedure
			.input(updateSettingsInputSchema)
			.mutation(({ input }) => updateUsageDisplaySettings(input)),
	});
};
