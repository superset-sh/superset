import { useQueries } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { setHostServiceSecret } from "renderer/lib/host-service-auth";

/** Re-mint with time to spare; a ticket lasts hours, so this is rare. */
const REFRESH_AT = 0.8;
const RETRY_MS = 30_000;
/**
 * The open workspace's wake is also what extends its sandbox session, which
 * stops after hours of not being asked; and if the session stops anyway, the
 * next wake is what brings it back.
 */
const OPEN_WORKSPACE_KEEPALIVE_MS = 10 * 60 * 1000;

export interface SandboxTarget {
	/** The cloud workspace's id, which is also its host address key. */
	workspaceId: string;
	organizationId: string;
	url: string;
	/**
	 * Whether the sandbox has a running session. A stopped one answers
	 * nothing until the open workspace wakes it, so nothing should fan
	 * requests out to it — they would only fail.
	 */
	running: boolean;
}

export interface SandboxAccessValue {
	targets: SandboxTarget[];
	/** False until the cloud list is known and every ready workspace in it has been addressed once. */
	isReady: boolean;
}

const SandboxAccessContext = createContext<SandboxAccessValue | null>(null);

/**
 * Keeps a live address for every ready cloud workspace.
 *
 * A sandbox has no `v2_hosts` row; it is reached through the sandbox gate
 * with a ticket the API mints, and this is the one place that asks for one.
 * Addressing talks to the Superset API, not the sandbox, so it wakes
 * nothing — a sidebar full of sleeping sandboxes must stay asleep. Only the
 * open workspace asks to be woken, and that call returns once host-service
 * inside it answers, so its address is usable the moment it lands.
 */
export function SandboxAccessProvider({ children }: { children: ReactNode }) {
	const { workspaces: cloudWorkspaces, organizationId } = useCloudWorkspaces();
	const { workspaceId: openWorkspaceId } = useParams({ strict: false });

	// Only a `ready` row has a sandbox to address: `access` refuses anything
	// else, and a provisioning workspace asking for a ticket every few seconds
	// would be a retry loop against a guaranteed rejection.
	const workspaces = useMemo(
		() =>
			(cloudWorkspaces ?? []).filter(
				(workspace) => workspace.status === "ready",
			),
		[cloudWorkspaces],
	);

	const results = useQueries({
		queries: workspaces.map((workspace) => {
			const wake = workspace.id === openWorkspaceId;
			return {
				queryKey: ["cloud-workspace", "access", workspace.id, wake] as const,
				// The gate is reachable over the public internet, so this must not
				// pause with navigator.onLine the way the default mode would.
				networkMode: "always" as const,
				queryFn: async () => {
					const granted = await apiTrpcClient.cloudWorkspace.access.mutate({
						id: workspace.id,
						wake,
					});
					setHostServiceSecret(granted.url, granted.token);
					return {
						url: granted.url,
						running: wake || granted.running,
						expiresAt: new Date(granted.expiresAt).getTime(),
					};
				},
				refetchInterval: (query: {
					state: { data?: { expiresAt: number } };
				}): number => {
					const expiresAt = query.state.data?.expiresAt;
					if (!expiresAt) return RETRY_MS;
					const refreshIn = (expiresAt - Date.now()) * REFRESH_AT;
					return Math.max(
						RETRY_MS,
						wake ? Math.min(refreshIn, OPEN_WORKSPACE_KEEPALIVE_MS) : refreshIn,
					);
				},
				refetchIntervalInBackground: true,
				// A wake grant is only as good as the session it woke: leaving the
				// workspace drops it, so coming back waits for a fresh wake instead
				// of pointing every pane at a sandbox that may have stopped since.
				gcTime: wake ? 0 : undefined,
			};
		}),
	});

	const value = useMemo<SandboxAccessValue>(() => {
		const targets: SandboxTarget[] = [];
		for (const [index, workspace] of workspaces.entries()) {
			const data = results[index]?.data;
			if (!data || !organizationId) continue;
			targets.push({
				workspaceId: workspace.id,
				organizationId,
				url: data.url,
				running: data.running,
			});
		}
		return {
			targets,
			isReady:
				cloudWorkspaces !== undefined &&
				results.every((result) => result.isFetched),
		};
	}, [cloudWorkspaces, workspaces, results, organizationId]);

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
