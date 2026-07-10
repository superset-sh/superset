import { CLIError } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import type { ApiClient } from "../api-client";
import { isProcessAlive, readManifest } from "../host/manifest";
import { type HostServiceClient, resolveHostTarget } from "../host-target";

export interface HostInfo {
	id: string;
	name: string;
	online: boolean;
}

export type HostWorkspaceRow = Awaited<
	ReturnType<HostServiceClient["workspace"]["list"]["query"]>
>[number];

export interface ListHostWorkspacesOptions {
	api: ApiClient;
	organizationId: string;
	userJwt: string;
	/** Restrict the fan-out to a single host. */
	hostId?: string;
}

export interface HostWorkspacesResult {
	workspaces: HostWorkspaceRow[];
	/** Org hosts from cloud discovery (empty when the cloud is unreachable). */
	hosts: HostInfo[];
	/** Per-host problems (unreachable host, failed cloud discovery, ...). */
	warnings: string[];
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Workspace records are host-owned: discover the org's hosts via the cloud
 * (`host.list` stays cloud-owned), then query each online host's
 * `workspace.list` (local host via its manifest, remote hosts via the relay)
 * and merge. Per-host failures become warnings, not errors; when cloud
 * discovery itself fails, fall back to just this machine's host so the local
 * list keeps working offline.
 */
export async function listHostWorkspaces(
	options: ListHostWorkspacesOptions,
): Promise<HostWorkspacesResult> {
	const warnings: string[] = [];
	const localHostId = getHostId();

	// Host discovery stays cloud-owned; tolerate the cloud being unreachable
	// (host names degrade to ids, targeting falls back to the local host).
	let hosts: HostInfo[] = [];
	let discoveryError: unknown;
	try {
		hosts = await options.api.host.list.query({
			organizationId: options.organizationId,
		});
	} catch (error) {
		discoveryError = error;
	}

	let targetHostIds: string[];
	if (options.hostId) {
		targetHostIds = [options.hostId];
	} else if (hosts.length > 0) {
		const ids = new Set(
			hosts.filter((host) => host.online).map((host) => host.id),
		);
		// Cloud presence can lag: always include this machine's host when its
		// host-service manifest points at a live process.
		const manifest = readManifest(options.organizationId);
		if (manifest && isProcessAlive(manifest.pid)) {
			ids.add(localHostId);
		}
		targetHostIds = [...ids];
	} else {
		if (discoveryError !== undefined) {
			warnings.push(
				`Cloud host discovery failed (${describeError(discoveryError)}); listing this machine's host only`,
			);
		}
		targetHostIds = [localHostId];
	}

	const hostNameById = new Map(hosts.map((host) => [host.id, host.name]));
	const describeHost = (hostId: string): string =>
		hostNameById.get(hostId) ?? hostId;

	const settled = await Promise.allSettled(
		targetHostIds.map(async (hostId) => {
			const target = resolveHostTarget({
				requestedHostId: hostId,
				organizationId: options.organizationId,
				userJwt: options.userJwt,
			});
			return target.client.workspace.list.query();
		}),
	);

	const workspaces: HostWorkspaceRow[] = [];
	settled.forEach((result, index) => {
		const hostId = targetHostIds[index];
		if (!hostId) return;
		if (result.status === "fulfilled") {
			workspaces.push(...result.value);
		} else {
			warnings.push(
				`Host ${describeHost(hostId)} unreachable: ${describeError(result.reason)}`,
			);
		}
	});

	return { workspaces, hosts, warnings };
}

export interface FindHostWorkspaceResult {
	workspace: HostWorkspaceRow | undefined;
	warnings: string[];
}

/** Find one workspace by id across the org's reachable hosts. */
export async function findHostWorkspace(
	options: Omit<ListHostWorkspacesOptions, "hostId">,
	workspaceId: string,
): Promise<FindHostWorkspaceResult> {
	const { workspaces, warnings } = await listHostWorkspaces(options);
	return {
		workspace: workspaces.find((workspace) => workspace.id === workspaceId),
		warnings,
	};
}

export interface WorkspacePinInput {
	workspaceId?: string;
	hostId?: string;
	projectId?: string;
}

export interface WorkspacePin {
	targetHostId?: string;
	v2ProjectId?: string;
}

/**
 * Automations that pin a workspace should carry the fully denormalized pin
 * (`targetHostId` + `v2ProjectId`) so the cloud never needs a
 * workspace-registry lookup. Resolve the workspace across the org's hosts
 * and derive the missing fields; if no reachable host knows the id, warn and
 * return an empty pin — the cloud's legacy lookup path (kept until R3)
 * resolves it instead. Warnings print to stderr.
 */
export async function resolveWorkspacePin(
	options: Omit<ListHostWorkspacesOptions, "hostId">,
	input: WorkspacePinInput,
): Promise<WorkspacePin> {
	if (!input.workspaceId || (input.hostId && input.projectId)) {
		return {};
	}

	const { workspace, warnings } = await findHostWorkspace(
		options,
		input.workspaceId,
	);
	for (const warning of warnings) {
		process.stderr.write(`Warning: ${warning}\n`);
	}
	if (!workspace) {
		process.stderr.write(
			`Warning: workspace ${input.workspaceId} was not found on any reachable host; deferring to the cloud's workspace record\n`,
		);
		return {};
	}
	if (input.hostId && input.hostId !== workspace.hostId) {
		throw new CLIError(
			"--host does not match the workspace's host",
			`Workspace ${input.workspaceId} lives on host ${workspace.hostId}`,
		);
	}
	if (input.projectId && input.projectId !== workspace.projectId) {
		throw new CLIError(
			"--project does not match the workspace's project",
			`Workspace ${input.workspaceId} belongs to project ${workspace.projectId}`,
		);
	}
	return {
		targetHostId: workspace.hostId,
		v2ProjectId: workspace.projectId,
	};
}
