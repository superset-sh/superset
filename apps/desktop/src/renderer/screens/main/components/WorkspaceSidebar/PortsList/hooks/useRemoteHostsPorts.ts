import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { DetectedPort } from "shared/types";

const REMOTE_PORTS_REFETCH_INTERVAL_MS = 5_000;

export interface RemotePort extends DetectedPort {
	label: string | null;
}

export interface RemoteHostPorts {
	hostId: string;
	hostUrl: string;
	ports: RemotePort[];
}

/**
 * Polls ports from every online v2 host-service on a *different* machine than
 * this desktop. Local machine ports stay on the Electron-main port manager via
 * `electronTrpc.ports` — duplicating them here would produce two rows per port.
 *
 * Polling (vs. SSE subscribe) is deliberate: the host-service already debounces
 * scans behind hint detection, so `ports.getAll` is a cheap in-memory read.
 * Polling keeps us off `httpSubscriptionLink`, which would require splitLink
 * plumbing on the host-service client for a single consumer.
 */
export function useRemoteHostsPorts(): RemoteHostPorts[] {
	const collections = useCollections();
	const { machineId } = useLocalHostService();

	const { data: onlineHosts = [] } = useLiveQuery(
		(q) =>
			q
				.from({ hosts: collections.v2Hosts })
				.where(({ hosts }) => eq(hosts.isOnline, true))
				.select(({ hosts }) => ({
					id: hosts.id,
					machineId: hosts.machineId,
				})),
		[collections],
	);

	const remoteHosts = useMemo(
		() => onlineHosts.filter((h) => h.machineId !== machineId),
		[onlineHosts, machineId],
	);

	const queries = useQueries({
		queries: remoteHosts.map((host) => {
			const hostUrl = `${env.RELAY_URL}/hosts/${host.id}`;
			return {
				queryKey: ["remote-host-ports", host.id],
				refetchInterval: REMOTE_PORTS_REFETCH_INTERVAL_MS,
				queryFn: async (): Promise<RemoteHostPorts> => {
					const client = getHostServiceClientByUrl(hostUrl);
					const ports = await client.ports.getAll.query();
					return { hostId: host.id, hostUrl, ports };
				},
			};
		}),
	});

	return useMemo(
		() => queries.flatMap((q) => (q.data ? [q.data] : [])),
		[queries],
	);
}
