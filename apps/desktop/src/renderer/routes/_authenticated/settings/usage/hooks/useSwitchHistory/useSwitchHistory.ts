import type { AppRouter } from "@superset/host-service";
import { useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type SwitchHistoryEntry =
	RouterOutputs["usage"]["engine"]["history"]["entries"][number];

/** Why the engine moved (KTD6): structured, so the renderer composes and
 * translates the sentence instead of showing host-composed text. */
export type SwitchReasonKind = SwitchHistoryEntry["reasonKind"];

export const SWITCH_HISTORY_QUERY_KEY = ["host-switch-history"] as const;

const DEFAULT_LIMIT = 20;

/** R21. Newest first, as the host returns it. */
export function useSwitchHistory(
	hostUrl: string | null,
	limit: number = DEFAULT_LIMIT,
) {
	return useQuery({
		queryKey: [...SWITCH_HISTORY_QUERY_KEY, hostUrl, limit] as const,
		enabled: !!hostUrl,
		queryFn: (): Promise<{ entries: SwitchHistoryEntry[] }> => {
			if (!hostUrl) throw new Error("No host connection.");
			return getHostServiceClientByUrl(hostUrl).usage.engine.history.query({
				limit,
			});
		},
	});
}
