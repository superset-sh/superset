import { useQueries } from "@tanstack/react-query";
import { useHostUrls } from "renderer/hooks/host-service/useHostTargetUrl";
import { useKnownHosts } from "renderer/hooks/known-hosts/useKnownHosts";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { mergeDeletedProjects } from "./useDeletedProjects.utils";

export function useDeletedProjects() {
	const { machineId } = useLocalHostService();
	const { hosts } = useKnownHosts();
	const hostIds = [
		...new Set([
			...(machineId ? [machineId] : []),
			...hosts.filter((host) => host.isOnline).map((host) => host.machineId),
		]),
	];
	const reachable = useHostUrls(hostIds).filter(
		(host): host is { hostId: string; url: string; isLocal: boolean } =>
			host.url !== null,
	);
	const results = useQueries({
		queries: reachable.map((host) => ({
			queryKey: ["deleted-projects", host.hostId],
			queryFn: () =>
				getHostServiceClientByUrl(host.url).project.listDeleted.query(),
		})),
	});
	const hostName = (hostId: string) =>
		hosts.find((host) => host.machineId === hostId)?.name ?? null;
	return {
		hostIds,
		hostName,
		isLoading: results.some((result) => result.isPending),
		deleted: mergeDeletedProjects(
			reachable.map((host, index) => ({
				hostId: host.hostId,
				url: host.url,
				rows: results[index]?.data ?? [],
			})),
		),
	};
}
