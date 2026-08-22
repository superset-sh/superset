import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { AppState } from "react-native";
import type { CloudWorkspaceRow } from "@/hooks/useCloudWorkspaces";
import { ensureSandboxAccess } from "@/lib/sandbox-access";

/** Re-mint with time to spare; the provider's token is short-lived. */
const REFRESH_AT = 0.8;
const RETRY_MS = 30_000;

const SANDBOX_ACCESS_QUERY_KEY = ["cloud", "sandbox-access"] as const;

export interface SandboxTarget {
	/** The cloud workspace's id, which is also its host id. */
	workspaceId: string;
	organizationId: string;
	url: string;
}

export interface SandboxAccessValue {
	targets: SandboxTarget[];
	/** False until every ready cloud workspace has been addressed once. */
	isReady: boolean;
}

/**
 * Keeps a live address for every ready cloud workspace.
 *
 * A sandbox has no host row and no stable URL — it is reachable only through
 * a token this brokers, and that token expires. Minting for all of them
 * (rather than only the open one) is what lets the rest of the app treat a
 * sandbox as just another host: workspace rows, terminals, diff stats are all
 * keyed by host id, so once a sandbox has an address they light up with no
 * cloud-specific code.
 *
 * iOS freezes JS timers in the background, so an interval alone would come
 * back to an expired token after a long sleep; returning to the foreground
 * re-checks every grant, and the dial path re-mints on its own if stale.
 */
export function useSandboxAccess(
	cloudWorkspaces: CloudWorkspaceRow[],
): SandboxAccessValue {
	const queryClient = useQueryClient();

	// Only a `ready` row has a sandbox to address: `access` refuses anything
	// else, and a provisioning workspace asking for a token every few seconds
	// would be a retry loop against a guaranteed rejection.
	const ready = useMemo(
		() => cloudWorkspaces.filter((row) => row.status === "ready"),
		[cloudWorkspaces],
	);

	const results = useQueries({
		queries: ready.map((row) => ({
			queryKey: [...SANDBOX_ACCESS_QUERY_KEY, row.id] as const,
			networkMode: "always" as const,
			queryFn: async () => {
				const access = await ensureSandboxAccess(row.id);
				return { url: access.url, expiresAt: access.expiresAt };
			},
			// No refetchIntervalInBackground: that flag is about browser window
			// focus, which React Query never sees here — iOS freezes the timers
			// wholesale, and the AppState listener below is the resume path.
			refetchInterval: (query: {
				state: { data?: { expiresAt: number } };
			}): number => {
				const expiresAt = query.state.data?.expiresAt;
				if (!expiresAt) return RETRY_MS;
				return Math.max(RETRY_MS, (expiresAt - Date.now()) * REFRESH_AT);
			},
		})),
	});

	useEffect(() => {
		const subscription = AppState.addEventListener("change", (state) => {
			if (state !== "active") return;
			// ensureSandboxAccess is a no-op for a grant that is still fresh, so
			// this only costs a mint for the ones that lapsed while asleep.
			void queryClient.invalidateQueries({
				queryKey: SANDBOX_ACCESS_QUERY_KEY,
			});
		});
		return () => subscription.remove();
	}, [queryClient]);

	return useMemo<SandboxAccessValue>(() => {
		const targets: SandboxTarget[] = [];
		ready.forEach((row, index) => {
			const url = results[index]?.data?.url;
			if (!url) return;
			targets.push({
				workspaceId: row.id,
				organizationId: row.organizationId,
				url,
			});
		});
		return {
			targets,
			isReady: results.every((result) => result.isFetched),
		};
	}, [ready, results]);
}
