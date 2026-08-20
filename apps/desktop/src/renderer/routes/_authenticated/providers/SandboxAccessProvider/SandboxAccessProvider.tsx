import { useQueries } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { setSandboxCredentials } from "renderer/lib/host-service-auth";

/** Re-mint with time to spare; the provider's token is short-lived. */
const REFRESH_AT = 0.8;
const RETRY_MS = 30_000;

export interface SandboxTarget {
	/** The cloud workspace's id, which is also its host address key. */
	workspaceId: string;
	organizationId: string;
	url: string;
}

export interface SandboxAccessValue {
	targets: SandboxTarget[];
	/** False until every ready cloud workspace has been addressed once. */
	isReady: boolean;
}

const SandboxAccessContext = createContext<SandboxAccessValue | null>(null);

/**
 * Keeps a live address for every ready cloud workspace.
 *
 * A sandbox has no `v2_hosts` row and no stable URL — it is reachable only
 * through a token this brokers, and that token expires. Minting for all of
 * them (rather than only the open one) is what lets the rest of the app treat
 * a sandbox as just another host: the workspace, pull-request, agent-status
 * and diff-stat fan-outs are all keyed by host address, so once a sandbox has
 * one they light up with no cloud-specific code.
 */
export function SandboxAccessProvider({ children }: { children: ReactNode }) {
	const { workspaces: cloudWorkspaces, organizationId } = useCloudWorkspaces();

	// Only a `ready` row has a sandbox to address: `access` refuses anything
	// else, and a provisioning workspace asking for a token every few seconds
	// would be a retry loop against a guaranteed rejection.
	const workspaces = useMemo(
		() => cloudWorkspaces.filter((workspace) => workspace.status === "ready"),
		[cloudWorkspaces],
	);

	const results = useQueries({
		queries: workspaces.map((workspace) => ({
			queryKey: ["cloud-workspace", "access", workspace.id] as const,
			// The sandbox is reachable over the public internet, so this must not
			// pause with navigator.onLine the way the default mode would.
			networkMode: "always" as const,
			queryFn: async () => {
				const granted = await apiTrpcClient.cloudWorkspace.access.mutate({
					id: workspace.id,
				});
				setSandboxCredentials(granted.url, {
					previewToken: granted.token,
				});
				return {
					url: granted.url,
					expiresAt: new Date(granted.expiresAt).getTime(),
				};
			},
			refetchInterval: (query: {
				state: { data?: { expiresAt: number } };
			}): number => {
				const expiresAt = query.state.data?.expiresAt;
				if (!expiresAt) return RETRY_MS;
				return Math.max(RETRY_MS, (expiresAt - Date.now()) * REFRESH_AT);
			},
			refetchIntervalInBackground: true,
		})),
	});

	const value = useMemo<SandboxAccessValue>(() => {
		const targets: SandboxTarget[] = [];
		for (const [index, workspace] of workspaces.entries()) {
			const url = results[index]?.data?.url;
			if (!url || !organizationId) continue;
			targets.push({ workspaceId: workspace.id, organizationId, url });
		}
		return {
			targets,
			isReady: results.every((result) => result.isFetched),
		};
	}, [workspaces, results, organizationId]);

	return (
		<SandboxAccessContext.Provider value={value}>
			{children}
		</SandboxAccessContext.Provider>
	);
}

/** Empty (never null) so consumers work outside the provider, e.g. in tests. */
export function useSandboxAccess(): SandboxAccessValue {
	return useContext(SandboxAccessContext) ?? { targets: [], isReady: true };
}
