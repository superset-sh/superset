import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { env } from "renderer/env.renderer";
import { useKnownHosts } from "renderer/hooks/known-hosts/useKnownHosts";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { getHostEventBus } from "renderer/lib/host-event-bus";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { MOCK_ORG_ID } from "shared/constants";
import { deriveHostProjectsQueryTargets } from "../useHostProjects/useHostProjects.utils";
import {
	type HostTagFolderSetting,
	type HostTagFoldersResult,
	mergeHostTagFolders,
} from "./useHostTagFolders.utils";

const TAG_FOLDERS_FALLBACK_REFETCH_INTERVAL_MS = 60_000;

export interface UseHostTagFoldersResult {
	tagFolders: HostTagFolderSetting[];
	hostResults: HostTagFoldersResult[];
	/** True once discovery settled and no reachable host read is pending. */
	isReady: boolean;
}

/**
 * The tag-folder read path: query each known host that can contribute sidebar
 * workspaces, retain its readiness, and reconcile project scopes served by
 * more than one host. Folders travel on their own channel rather than riding
 * project snapshots, because the host-local Sessions lane has no project.
 *
 * Deliberately lighter than `useHostProjects`: no IndexedDB snapshot. These
 * rows are presentation-only, so a folder that renders with its default name
 * and colour for one paint is a non-event — unlike a missing project, which
 * would empty the sidebar.
 */
export function useHostTagFolders(): UseHostTagFoldersResult {
	const queryClient = useQueryClient();
	const { activeHostUrl, machineId, activeOrganizationId } =
		useLocalHostService();
	const relayUrl = useRelayUrl();
	const fallbackOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (activeOrganizationId ?? null);
	const { hosts, settled: knownHostsSettled } = useKnownHosts();

	const targets = useMemo(
		() =>
			deriveHostProjectsQueryTargets({
				activeHostUrl,
				hosts,
				machineId,
				relayUrl,
				fallbackOrganizationId,
			}),
		[activeHostUrl, hosts, machineId, relayUrl, fallbackOrganizationId],
	);

	const queryKeys = useMemo(
		() =>
			targets.map((target) => [
				"host-tag-folders",
				target.organizationId,
				target.machineId,
			]),
		[targets],
	);

	const queries = useQueries({
		queries: targets.map((target, index) => ({
			queryKey: queryKeys[index] as string[],
			enabled: target.hostUrl !== null,
			refetchInterval: TAG_FOLDERS_FALLBACK_REFETCH_INTERVAL_MS,
			// See useHostProjects: "online" networkMode would pause 127.0.0.1
			// queries when navigator.onLine is false, defeating offline-first.
			networkMode: "always" as const,
			refetchIntervalInBackground: true,
			retry: 1,
			queryFn: async (): Promise<HostTagFolderSetting[]> => {
				if (!target.hostUrl) return [];
				const client = getHostServiceClientByUrl(target.hostUrl);
				// Let failures remain failures. In particular, an old host with no
				// tagFolders router must not look like a successful empty response:
				// the migration uses per-host readiness before attempting writes.
				return (await client.tagFolders.list.query()) as HostTagFolderSetting[];
			},
		})),
	});

	// Live updates: refetch the owning host on its own tag-folders:changed.
	useEffect(() => {
		const cleanups: Array<() => void> = [];
		for (const [index, target] of targets.entries()) {
			if (!target.hostUrl) continue;
			const bus = getHostEventBus(target.hostUrl);
			const key = queryKeys[index];
			const removeListener = bus.on("tag-folders:changed", "*", () => {
				void queryClient.invalidateQueries({ queryKey: key });
			});
			const releaseBus = bus.retain();
			cleanups.push(() => {
				removeListener();
				releaseBus();
			});
		}
		return () => {
			for (const cleanup of cleanups) cleanup();
		};
	}, [targets, queryKeys, queryClient]);

	const hostResults = useMemo<HostTagFoldersResult[]>(
		() =>
			targets.map((target, index) => {
				const query = queries[index];
				return {
					target,
					status:
						target.hostUrl === null
							? "offline"
							: query?.isSuccess
								? "ready"
								: query?.isError
									? "error"
									: "pending",
					settings: query?.data ?? [],
				};
			}),
		[targets, queries],
	);
	const tagFolders = useMemo(
		() => mergeHostTagFolders(hostResults),
		[hostResults],
	);
	const isReady =
		knownHostsSettled &&
		targets.length > 0 &&
		hostResults.every((result) => result.status !== "pending");

	return { tagFolders, hostResults, isReady };
}
