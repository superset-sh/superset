// INTERIM: AppRouter comes from generated dist-types until the wire contract
// moves to a neutral package — see packages/host-service/docs/interim-router-types.md
import type { AppRouter } from "@superset/host-service/router";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { createTRPCClient, httpLink, type TRPCClient } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import superjson from "superjson";
import { getJwt } from "../auth/client";
import { transportRetryLink } from "../errors";
import { getRelayUrl } from "../host/client";
import { getSandboxAccess, sandboxToken } from "../sandbox-access";

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

/**
 * Where host-service answers for a host. A machine is reached through the
 * relay by routing key; a cloud workspace's sandbox is its own host — keyed
 * by the workspace's id — and is reached directly at the address the cloud
 * brokered for it, so anything addressing hosts by id works for both.
 */
export function hostServiceUrl(
	organizationId: string,
	machineId: string,
): string {
	const sandbox = getSandboxAccess(machineId);
	if (sandbox) return sandbox.url;
	return `${getRelayUrl()}/hosts/${buildHostRoutingKey(organizationId, machineId)}`;
}

export function getHostServiceClientByUrl(hostUrl: string): HostServiceClient {
	const cached = clientCache.get(hostUrl);
	if (cached) return cached;

	const client = createTRPCClient<AppRouter>({
		links: [
			transportRetryLink(),
			httpLink({
				url: `${hostUrl}/trpc`,
				transformer: superjson,
				headers: () => {
					const headers: Record<string, string> = {};
					// A sandbox's host-service checks the token the cloud signed for
					// it; a relay-reached host takes the user's JWT.
					const bearer = sandboxToken(hostUrl) ?? getJwt();
					if (bearer) headers.Authorization = `Bearer ${bearer}`;
					return headers;
				},
			}),
		],
	});

	clientCache.set(hostUrl, client);
	return client;
}
