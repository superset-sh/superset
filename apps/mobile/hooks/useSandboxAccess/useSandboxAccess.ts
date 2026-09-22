import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { AppState } from "react-native";
import type { CloudWorkspaceRow } from "@/hooks/useCloudWorkspaces";
import { wakeSandboxAccess } from "@/lib/sandbox-access";

/**
 * Each mint wakes, which is also what extends the sandbox's session: it stops
 * after hours of not being asked, and the next wake brings it back. Same
 * cadence as the desktop's open workspace.
 */
const KEEPALIVE_MS = 10 * 60 * 1000;
const RETRY_MS = 30_000;

const SANDBOX_ACCESS_QUERY_KEY = ["cloud", "sandbox-access"] as const;

export interface SandboxTarget {
	/** The cloud workspace's id, which is also its host id. */
	workspaceId: string;
	organizationId: string;
	url: string;
}

export interface SandboxAccessValue {
	target: SandboxTarget | null;
	/** False until the workspace has been addressed once. */
	isReady: boolean;
	/** True while the last attempt to address it failed; attempts continue. */
	isError: boolean;
	retry: () => void;
}

/**
 * Keeps the open cloud workspace addressed and awake.
 *
 * A sandbox has no host row and no stable URL — it is reachable only through
 * a ticket this brokers. Only the workspace on screen is addressed: every
 * mint wakes its sandbox, and waking the rest of a list would resume and bill
 * sandboxes nobody is looking at.
 *
 * iOS freezes JS timers in the background, so the interval alone would come
 * back to a stopped sandbox after a long sleep; returning to the foreground
 * wakes it again.
 */
export function useSandboxAccess(
	cloud: CloudWorkspaceRow | null,
): SandboxAccessValue {
	const queryClient = useQueryClient();

	// Only a `ready` row has a sandbox to address: `access` refuses anything
	// else, and a provisioning workspace asking for a ticket every few seconds
	// would be a retry loop against a guaranteed rejection.
	const ready = cloud?.status === "ready" ? cloud : null;

	const query = useQuery({
		queryKey: [...SANDBOX_ACCESS_QUERY_KEY, ready?.id ?? null] as const,
		enabled: ready !== null,
		// Every sheet on the workspace mounts this; a mount is not a reason to wake.
		staleTime: KEEPALIVE_MS,
		networkMode: "always" as const,
		queryFn: async () => {
			const access = await wakeSandboxAccess((ready as CloudWorkspaceRow).id);
			return { url: access.url };
		},
		// No refetchIntervalInBackground: that flag is about browser window
		// focus, which React Query never sees here — iOS freezes the timers
		// wholesale, and the AppState listener below is the resume path.
		refetchInterval: (current) =>
			current.state.data ? KEEPALIVE_MS : RETRY_MS,
	});

	useEffect(() => {
		const subscription = AppState.addEventListener("change", (state) => {
			if (state !== "active") return;
			void queryClient.invalidateQueries({
				queryKey: SANDBOX_ACCESS_QUERY_KEY,
			});
		});
		return () => subscription.remove();
	}, [queryClient]);

	const url = query.data?.url ?? null;
	return useMemo<SandboxAccessValue>(
		() => ({
			target:
				ready && url
					? {
							workspaceId: ready.id,
							organizationId: ready.organizationId,
							url,
						}
					: null,
			isReady: ready === null || query.isFetched,
			isError: query.isError,
			retry: () => void query.refetch(),
		}),
		[ready, url, query.isFetched, query.isError, query.refetch],
	);
}
