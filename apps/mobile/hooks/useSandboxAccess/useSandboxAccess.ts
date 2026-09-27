import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { AppState } from "react-native";
import type { CloudWorkspaceRow } from "@/hooks/useCloudWorkspaces";
import { addressSandboxAccess, wakeSandboxAccess } from "@/lib/sandbox-access";

/**
 * A wake is also what extends the sandbox's session: it stops after hours of
 * not being asked, and the next wake brings it back. Same cadence as the
 * desktop's open workspace.
 */
const KEEPALIVE_MS = 10 * 60 * 1000;
const RETRY_MS = 30_000;

const SANDBOX_ADDRESS_QUERY_KEY = ["cloud", "sandbox-address"] as const;
const SANDBOX_WAKE_QUERY_KEY = ["cloud", "sandbox-wake"] as const;

export interface SandboxTarget {
	/** The cloud workspace's id, which is also its host id. */
	workspaceId: string;
	organizationId: string;
	url: string;
}

export interface SandboxAccessValue {
	target: SandboxTarget | null;
	/** True while the last attempt to address it failed; attempts continue. */
	isError: boolean;
	/** True until the sandbox has been woken since this workspace opened. */
	isWaking: boolean;
	retry: () => void;
}

/**
 * Keeps the open cloud workspace addressed and awake, the way desktop's
 * SandboxAccessProvider does: the workspace is used at its last known address
 * straight away, as if its box were up, and waking runs beside that rather
 * than in front of it. The wake hands back a fresh address, since a resumed
 * box can answer on a new domain.
 *
 * Only the workspace on screen is woken: waking the rest of a list would
 * resume and bill sandboxes nobody is looking at.
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
	const addressKey = [...SANDBOX_ADDRESS_QUERY_KEY, ready?.id ?? null] as const;

	const address = useQuery({
		queryKey: addressKey,
		enabled: ready !== null,
		// The wake below re-mints every few minutes and writes its grant here.
		staleTime: Number.POSITIVE_INFINITY,
		networkMode: "always" as const,
		queryFn: async () => {
			const access = await addressSandboxAccess(
				(ready as CloudWorkspaceRow).id,
			);
			return { url: access.url };
		},
		refetchInterval: (current) => (current.state.data ? false : RETRY_MS),
	});

	const wake = useQuery({
		queryKey: [...SANDBOX_WAKE_QUERY_KEY, ready?.id ?? null] as const,
		// The API client batches calls made in the same tick, which would hold
		// the address back until the wake returns.
		enabled: ready !== null && address.data !== undefined,
		// Every sheet on the workspace mounts this; a mount is not a reason to wake.
		staleTime: KEEPALIVE_MS,
		networkMode: "always" as const,
		queryFn: async () => {
			const access = await wakeSandboxAccess((ready as CloudWorkspaceRow).id);
			queryClient.setQueryData(addressKey, { url: access.url });
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
				queryKey: SANDBOX_WAKE_QUERY_KEY,
			});
		});
		return () => subscription.remove();
	}, [queryClient]);

	const url = address.data?.url ?? null;
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
			isError: address.isError,
			isWaking: ready !== null && wake.data === undefined,
			retry: () => {
				void address.refetch();
				void wake.refetch();
			},
		}),
		[ready, url, address.isError, address.refetch, wake.data, wake.refetch],
	);
}
