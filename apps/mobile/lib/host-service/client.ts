// INTERIM: AppRouter comes from generated dist-types until the wire contract
// moves to a neutral package — see packages/host-service/docs/interim-router-types.md
import type { AppRouter } from "@superset/host-service/router";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { createTRPCClient, httpLink, type TRPCClient } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import superjson from "superjson";
import { getJwt } from "../auth/client";
import { env } from "../env";

export type HostServiceClient = TRPCClient<AppRouter>;

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type HostWorkspaceRow = RouterOutputs["workspace"]["list"][number];
export type GitStatusSnapshot = RouterOutputs["git"]["getStatus"];
export type ChangedFileStats = GitStatusSnapshot["againstBase"][number];
export type DestroyWorkspaceResult =
	RouterOutputs["workspaceCleanup"]["destroy"];
export type CreateWorkspaceResult = RouterOutputs["workspaces"]["create"];
export type AgentLaunchResult = CreateWorkspaceResult["agents"][number];
export type BranchSearchResult =
	RouterOutputs["workspaceCreation"]["searchBranches"];
export type BranchSearchRow = BranchSearchResult["items"][number];
export type HostProjectRow = RouterOutputs["project"]["list"][number];

const clientCache = new Map<string, HostServiceClient>();

export function buildRelayHostUrl(
	organizationId: string,
	machineId: string,
): string {
	return `${env.EXPO_PUBLIC_RELAY_URL}/hosts/${buildHostRoutingKey(organizationId, machineId)}`;
}

export function getHostServiceClientByUrl(hostUrl: string): HostServiceClient {
	const cached = clientCache.get(hostUrl);
	if (cached) return cached;

	const client = createTRPCClient<AppRouter>({
		links: [
			httpLink({
				url: `${hostUrl}/trpc`,
				transformer: superjson,
				headers: () => {
					const jwt = getJwt();
					return jwt ? { Authorization: `Bearer ${jwt}` } : {};
				},
			}),
		],
	});

	clientCache.set(hostUrl, client);
	return client;
}
