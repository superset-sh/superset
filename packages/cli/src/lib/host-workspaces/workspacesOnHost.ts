import { getHostId } from "@superset/shared/host-info";
import { TRPCClientError } from "@trpc/client";
import { type HostServiceClient, resolveHostTarget } from "../host-target";

export type HostWorkspaceRow = Awaited<
	ReturnType<HostServiceClient["workspace"]["list"]["query"]>
>[number];

export type HostSectionRow = Awaited<
	ReturnType<HostServiceClient["sections"]["list"]["query"]>
>[number];

export interface HostWorkspacesOptions {
	organizationId: string;
	userJwt: string;
	/** Explicit host; defaults to this machine. */
	hostId?: string;
}

export interface HostWorkspacesResult {
	hostId: string;
	workspaces: HostWorkspaceRow[];
	/** Workspace groups on the same host; empty on a host too old to have them. */
	sections: HostSectionRow[];
}

/** Old host with no `sections` router (tRPC NOT_FOUND) vs. a transient error. */
function isMissingSectionsRouter(error: unknown): boolean {
	return error instanceof TRPCClientError && error.data?.code === "NOT_FOUND";
}

/**
 * Workspace reads are single-host by design: `--host` when given, else this
 * machine. There is no org-wide fan-out — the desktop is the cross-host view.
 */
export async function listWorkspacesOnHost(
	options: HostWorkspacesOptions,
): Promise<HostWorkspacesResult> {
	const hostId = options.hostId ?? getHostId();
	const target = resolveHostTarget({
		requestedHostId: hostId,
		organizationId: options.organizationId,
		userJwt: options.userJwt,
	});
	const [workspaces, sections] = await Promise.all([
		target.client.workspace.list.query(),
		// A host predating workspace groups has no `sections` router: that's
		// "no groups", not a failure. Any other error still surfaces.
		target.client.sections.list.query().catch((error: unknown) => {
			if (isMissingSectionsRouter(error)) return [] as HostSectionRow[];
			throw error;
		}),
	]);
	return { hostId, workspaces, sections };
}

export interface FindWorkspaceOnHostResult {
	hostId: string;
	workspace: HostWorkspaceRow | undefined;
	sections: HostSectionRow[];
}

export async function findWorkspaceOnHost(
	options: HostWorkspacesOptions,
	workspaceId: string,
): Promise<FindWorkspaceOnHostResult> {
	const { hostId, workspaces, sections } = await listWorkspacesOnHost(options);
	return {
		hostId,
		sections,
		workspace: workspaces.find((workspace) => workspace.id === workspaceId),
	};
}
