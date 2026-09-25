import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
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
	/** The gate address of the workspace's desktop stream, ticketed separately. */
	desktopUrl: string;
}

export interface SandboxAccessValue {
	targets: SandboxTarget[];
	/** False until the cloud list is known and every ready workspace in it has been addressed once. */
	isReady: boolean;
}

const SandboxAccessContext = createContext<SandboxAccessValue | null>(null);

interface SandboxAccess {
	url: string;
	desktopUrl: string;
	expiresAt: number;
}

function sandboxAccessQueryKey(workspaceId: string) {
	return ["cloud-workspace", "access", workspaceId] as const;
}

async function requestAccess(
	workspaceId: string,
	wake: boolean,
): Promise<SandboxAccess> {
	const granted = await apiTrpcClient.cloudWorkspace.access.mutate({
		id: workspaceId,
		wake,
	});
	setHostServiceSecret(granted.url, granted.token);
	setHostServiceSecret(granted.desktop.url, granted.desktop.token);
	return {
		url: granted.url,
		desktopUrl: granted.desktop.url,
		expiresAt: new Date(granted.expiresAt).getTime(),
	};
}

/**
 * Keeps a live address for every ready cloud workspace.
 *
 * A sandbox has no `v2_hosts` row; it is reached through the sandbox gate
 * with a ticket the API mints, and this is the one place that asks for one.
 * Addressing talks to the Superset API, not the sandbox, so it wakes
 * nothing — a sidebar full of sleeping sandboxes must stay asleep.
 *
 * The open workspace is used at its address straight away, as if its box
 * were up; a stopped one reports itself through the host connection strip
 * like any unreachable host. Waking it runs beside that, never in front of
 * it, and hands back a fresh ticket: a resumed box can answer on a new
 * domain, which the old ticket does not point at.
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
		queries: workspaces.map((workspace) => ({
			queryKey: sandboxAccessQueryKey(workspace.id),
			// The gate is reachable over the public internet, so this must not
			// pause with navigator.onLine the way the default mode would.
			networkMode: "always" as const,
			queryFn: () => requestAccess(workspace.id, false),
			refetchInterval: (query: { state: { data?: SandboxAccess } }): number => {
				const expiresAt = query.state.data?.expiresAt;
				if (!expiresAt) return RETRY_MS;
				return Math.max(RETRY_MS, (expiresAt - Date.now()) * REFRESH_AT);
			},
			refetchIntervalInBackground: true,
		})),
	});

	const queryClient = useQueryClient();
	const openWorkspace =
		workspaces.find((workspace) => workspace.id === openWorkspaceId) ?? null;
	useQuery({
		queryKey: ["cloud-workspace", "wake", openWorkspace?.id] as const,
		enabled: openWorkspace !== null,
		networkMode: "always",
		queryFn: async () => {
			if (!openWorkspace) return null;
			const access = await requestAccess(openWorkspace.id, true);
			queryClient.setQueryData(sandboxAccessQueryKey(openWorkspace.id), access);
			return access;
		},
		refetchInterval: OPEN_WORKSPACE_KEEPALIVE_MS,
		refetchIntervalInBackground: true,
		gcTime: 0,
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
				desktopUrl: data.desktopUrl,
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
