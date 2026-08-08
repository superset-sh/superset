import { collectProviderUsage } from "main/lib/provider-usage";
import { z } from "zod";
import { publicProcedure, router } from "..";
import {
	type ProviderUsageSnapshot,
	providerUsageSnapshotSchema,
} from "./provider-usage.schema";

interface CollectProviderUsageOptions {
	force?: boolean;
}

type ProviderUsageCollector = (
	options?: CollectProviderUsageOptions,
) => Promise<ProviderUsageSnapshot>;

const getSnapshotInputSchema = z
	.object({
		force: z.boolean().optional(),
	})
	.optional();

export const createProviderUsageRouter = (
	collector: ProviderUsageCollector = collectProviderUsage,
) => {
	return router({
		getSnapshot: publicProcedure
			.input(getSnapshotInputSchema)
			.output(providerUsageSnapshotSchema)
			.query(({ input }) => collector(input)),
	});
};
