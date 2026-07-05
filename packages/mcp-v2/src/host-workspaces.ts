import type { McpContext } from "./auth";
import { createMcpCaller } from "./caller";
import { hostServiceCall } from "./host-service-client";

/** Cloud-shaped workspace row served by a host's `workspace.list`. */
export interface HostWorkspaceRow {
	id: string;
	organizationId: string;
	projectId: string;
	hostId: string;
	name: string;
	branch: string;
	type: "main" | "worktree";
	createdByUserId: string | null;
	taskId: string | null;
	createdAt: Date;
	updatedAt: Date;
	worktreePath: string;
	worktreeExists: boolean;
}

export interface HostWorkspacesResult {
	workspaces: HostWorkspaceRow[];
	/** Hosts that were queried but did not answer; their workspaces are omitted. */
	unreachableHosts: Array<{ hostId: string; error: string }>;
}

/**
 * Workspace records are host-owned: resolve the org's hosts from the cloud
 * (`host.list` stays cloud-owned), then query each online host's
 * `workspace.list` over the relay with the caller's minted JWT and merge.
 * A host that fails to answer is skipped — its id lands in
 * `unreachableHosts` instead of failing the whole call.
 */
export async function listHostWorkspaces(
	ctx: McpContext,
	hostId?: string,
): Promise<HostWorkspacesResult> {
	let targetHostIds: string[];
	if (hostId) {
		// Explicit host: query it directly (the relay enforces org access),
		// even if cloud presence lags and still marks it offline.
		targetHostIds = [hostId];
	} else {
		const caller = createMcpCaller(ctx);
		const hosts = await caller.host.list({
			organizationId: ctx.organizationId,
		});
		targetHostIds = hosts.filter((host) => host.online).map((host) => host.id);
	}

	const results = await Promise.allSettled(
		targetHostIds.map((targetHostId) =>
			hostServiceCall<HostWorkspaceRow[]>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: targetHostId,
					jwt: ctx.bearerToken,
				},
				"workspace.list",
				"query",
			),
		),
	);

	const workspaces: HostWorkspaceRow[] = [];
	const unreachableHosts: HostWorkspacesResult["unreachableHosts"] = [];
	results.forEach((result, index) => {
		const targetHostId = targetHostIds[index];
		if (!targetHostId) return;
		if (result.status === "fulfilled") {
			workspaces.push(...result.value);
		} else {
			unreachableHosts.push({
				hostId: targetHostId,
				error:
					result.reason instanceof Error
						? result.reason.message
						: String(result.reason),
			});
		}
	});
	return { workspaces, unreachableHosts };
}

export interface WorkspacePin {
	targetHostId?: string | null;
	v2ProjectId?: string;
}

/**
 * Automations that pin a workspace should carry the fully denormalized pin
 * (`targetHostId` + `v2ProjectId`) so the cloud never needs a
 * workspace-registry lookup. When the caller omitted either field, derive
 * them from the owning host's records; if no reachable host knows the id,
 * return the caller's fields as-is and let the cloud's legacy lookup path
 * decide (that path exists until R3).
 */
export async function resolveWorkspacePin(
	ctx: McpContext,
	input: {
		v2WorkspaceId?: string | null;
		targetHostId?: string | null;
		v2ProjectId?: string;
	},
): Promise<WorkspacePin> {
	const pin: WorkspacePin = {};
	if (input.targetHostId !== undefined) pin.targetHostId = input.targetHostId;
	if (input.v2ProjectId !== undefined) pin.v2ProjectId = input.v2ProjectId;
	if (!input.v2WorkspaceId || (input.targetHostId && input.v2ProjectId)) {
		return pin;
	}

	const { workspaces } = await listHostWorkspaces(ctx);
	const workspace = workspaces.find((row) => row.id === input.v2WorkspaceId);
	if (!workspace) return pin;
	return {
		targetHostId: input.targetHostId ?? workspace.hostId,
		v2ProjectId: input.v2ProjectId ?? workspace.projectId,
	};
}
