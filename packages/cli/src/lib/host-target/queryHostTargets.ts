import { getHostId } from "@superset/shared/host-info";
import type { ApiClient } from "../api-client";
import { isProcessAlive, readManifest } from "../host/manifest";
import { type HostServiceClient, resolveHostTarget } from "./resolveHostTarget";

export interface HostInfo {
	id: string;
	name: string;
	online: boolean;
}

export interface HostQueryResult<T> {
	value: T;
	hostId: string;
	hostName: string;
	client: HostServiceClient;
}

export interface QueryHostTargetsOptions {
	api: ApiClient;
	organizationId: string;
	userJwt: string;
	/** Restrict the fan-out to a single host. */
	hostId?: string;
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Discover reachable host-service targets and run the same query on each. */
export async function queryHostTargets<T>(
	options: QueryHostTargetsOptions,
	query: (client: HostServiceClient) => Promise<T>,
): Promise<{
	results: HostQueryResult<T>[];
	hosts: HostInfo[];
	warnings: string[];
}> {
	const warnings: string[] = [];
	const localHostId = getHostId();
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
		const manifest = readManifest(options.organizationId);
		if (manifest && isProcessAlive(manifest.pid)) ids.add(localHostId);
		targetHostIds = [...ids];
		if (targetHostIds.length === 0) {
			warnings.push("No hosts are currently online; nothing to query");
		}
	} else {
		if (discoveryError !== undefined) {
			warnings.push(
				`Cloud host discovery failed (${describeError(discoveryError)}); checking this machine's host only`,
			);
		}
		targetHostIds = [localHostId];
	}

	const hostNames = new Map(hosts.map((host) => [host.id, host.name]));
	const settled = await Promise.allSettled(
		targetHostIds.map(async (hostId) => {
			const target = resolveHostTarget({
				requestedHostId: hostId,
				organizationId: options.organizationId,
				userJwt: options.userJwt,
			});
			return {
				hostId,
				client: target.client,
				value: await query(target.client),
			};
		}),
	);

	const results: HostQueryResult<T>[] = [];
	settled.forEach((result, index) => {
		const hostId = targetHostIds[index];
		if (!hostId) return;
		const hostName = hostNames.get(hostId) ?? hostId;
		if (result.status === "rejected") {
			warnings.push(
				`Host ${hostName} unreachable: ${describeError(result.reason)}`,
			);
			return;
		}
		results.push({ ...result.value, hostName });
	});

	return { results, hosts, warnings };
}
