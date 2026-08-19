import type { DraftTrigger } from "@superset/shared/automation-triggers";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { providerFor } from "./index";
import type { ProviderOptions } from "./types";

const STALE_MS = 5 * 60_000;

/**
 * The pickable values for the providers that are actually on screen, one
 * round trip per option group. A page holding a single schedule trigger asks
 * for nothing; adding a Slack row asks for Slack's lists and nothing else.
 */
export function useProviderOptions(
	organizationId: string,
	drafts: DraftTrigger[],
): ProviderOptions {
	const groups = useMemo(() => {
		const seen = new Set<string>();
		for (const draft of drafts) {
			const provider = providerFor(draft.config);
			if (provider.optionGroup) seen.add(provider.optionGroup);
		}
		return [...seen].sort();
	}, [drafts]);

	const trpc = cloudTrpc.useUtils();
	const results = useQueries({
		queries: groups.map((group) => ({
			queryKey: ["integration.triggerOptions", organizationId, group],
			queryFn: () =>
				trpc.integration.triggerOptions.fetch({ organizationId, group }),
			enabled: Boolean(organizationId),
			staleTime: STALE_MS,
		})),
	});

	return useMemo(() => {
		const options: ProviderOptions = {};
		groups.forEach((group, index) => {
			options[group] = results[index]?.data ?? {};
		});
		return options;
	}, [groups, results]);
}
