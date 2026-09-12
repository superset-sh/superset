import type { DraftTrigger } from "@superset/shared/automation-triggers";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { providerFor } from "./index";
import type { OptionGroupState, ProviderOptions } from "./types";

const STALE_MS = 5 * 60_000;

/**
 * The pickable values for the providers that are actually on screen, one
 * round trip per option group. A page holding a single schedule trigger asks
 * for nothing; adding a Slack row asks for Slack's lists and nothing else.
 *
 * `state` travels beside the lists rather than inside them because the lists
 * are indistinguishable on their own: an empty array is what loading, a
 * revoked token, and a genuinely empty workspace all look like, and the chips
 * need to say which one is happening.
 */
export function useProviderOptions(
	organizationId: string,
	drafts: DraftTrigger[],
): { options: ProviderOptions; state: Record<string, OptionGroupState> } {
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
		const state: Record<string, OptionGroupState> = {};
		groups.forEach((group, index) => {
			const result = results[index];
			options[group] = result?.data ?? {};
			state[group] = {
				// isFetching, not isLoading: a Refresh with data already on screen
				// must still read as in-flight, or the button gives no feedback.
				isLoading: result?.isFetching ?? false,
				isError: result?.isError ?? false,
				refetch: () => void result?.refetch(),
			};
		});
		return { options, state };
	}, [groups, results]);
}
