import { collectProviderUsage } from "main/lib/provider-usage";
import { codexProfileStore } from "main/lib/provider-usage/providers/codex-profiles";
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

interface ProviderUsageRouterDependencies {
	collect: ProviderUsageCollector;
	importCurrentCodex: () => Promise<{ profileName: string }>;
	addCodexAccount: () => Promise<{ profileName: string }>;
	switchCodexProfile: (profileName: string) => Promise<{ profileName: string }>;
}

const getSnapshotInputSchema = z
	.object({
		force: z.boolean().optional(),
	})
	.optional();

const switchCodexProfileInputSchema = z.object({
	profileName: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
});

const codexProfileMutationOutputSchema = z.object({
	profileName: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
});

const defaultDependencies: ProviderUsageRouterDependencies = {
	collect: collectProviderUsage,
	importCurrentCodex: async () => {
		const profile = await codexProfileStore.importActive();
		return { profileName: profile.profileName };
	},
	addCodexAccount: async () => {
		const profile = await codexProfileStore.addViaIsolatedLogin();
		return { profileName: profile.profileName };
	},
	switchCodexProfile: async (profileName) => {
		const profile = await codexProfileStore.activate(profileName);
		return { profileName: profile.profileName };
	},
};

function resolveDependencies(
	dependencies:
		| ProviderUsageCollector
		| Partial<ProviderUsageRouterDependencies>,
): ProviderUsageRouterDependencies {
	if (typeof dependencies === "function") {
		return { ...defaultDependencies, collect: dependencies };
	}
	return { ...defaultDependencies, ...dependencies };
}

export const createProviderUsageRouter = (
	dependencies:
		| ProviderUsageCollector
		| Partial<ProviderUsageRouterDependencies> = defaultDependencies,
) => {
	const resolved = resolveDependencies(dependencies);
	async function refreshAfterMutation<T extends { profileName: string }>(
		mutation: () => Promise<T>,
	): Promise<T> {
		const result = await mutation();
		await resolved.collect({ force: true });
		return result;
	}

	return router({
		getSnapshot: publicProcedure
			.input(getSnapshotInputSchema)
			.output(providerUsageSnapshotSchema)
			.query(({ input }) => resolved.collect(input)),
		importCurrentCodex: publicProcedure
			.output(codexProfileMutationOutputSchema)
			.mutation(() => refreshAfterMutation(resolved.importCurrentCodex)),
		addCodexAccount: publicProcedure
			.output(codexProfileMutationOutputSchema)
			.mutation(() => refreshAfterMutation(resolved.addCodexAccount)),
		switchCodexProfile: publicProcedure
			.input(switchCodexProfileInputSchema)
			.output(codexProfileMutationOutputSchema)
			.mutation(({ input }) =>
				refreshAfterMutation(() =>
					resolved.switchCodexProfile(input.profileName),
				),
			),
	});
};
