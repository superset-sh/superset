import { getHostId } from "@superset/shared/host-info";
import type { ApiClient } from "./api-client";
import { isProcessAlive, readManifest } from "./host/manifest";
import { type HostServiceClient, resolveHostTarget } from "./host-target";

export type HostAgentSession = Awaited<
	ReturnType<HostServiceClient["terminalAgents"]["list"]["query"]>
>[number];

export interface HostAgentSessionMatch {
	session: HostAgentSession;
	hostId: string;
	hostName: string;
	client: HostServiceClient;
}

interface ListOptions {
	api: ApiClient;
	organizationId: string;
	userJwt: string;
	hostId?: string;
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export async function listHostAgentSessions(options: ListOptions): Promise<{
	matches: HostAgentSessionMatch[];
	warnings: string[];
}> {
	const warnings: string[] = [];
	const localHostId = getHostId();
	let hosts: Array<{ id: string; name: string; online: boolean }> = [];
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
				sessions: await target.client.terminalAgents.list.query(),
			};
		}),
	);

	const matches: HostAgentSessionMatch[] = [];
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
		for (const session of result.value.sessions) {
			matches.push({
				session,
				hostId,
				hostName,
				client: result.value.client,
			});
		}
	});
	return { matches, warnings };
}
