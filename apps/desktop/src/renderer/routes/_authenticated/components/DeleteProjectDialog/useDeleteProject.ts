import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useRef, useState } from "react";
import { useHostUrls } from "renderer/hooks/host-service/useHostTargetUrl";
import { useKnownHosts } from "renderer/hooks/known-hosts/useKnownHosts";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useProjectDeletionHosts } from "renderer/routes/_authenticated/hooks/useProjectDeletionHosts";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import {
	defaultProjectDeletionSelection,
	selectedProjectDeletionTargets,
} from "./useDeleteProject.utils";

interface UseDeleteProjectOptions {
	projectId: string;
	projectName: string;
	hostIds: string[];
	creatorByHostId: Record<string, string | null>;
	selectedHostIds?: string[];
	onDeleted?: () => void;
}

export function useDeleteProject({
	projectId,
	projectName,
	hostIds,
	creatorByHostId,
	selectedHostIds,
	onDeleted,
}: UseDeleteProjectOptions) {
	const { t } = useLingui();
	const { access, isReady: permissionsReady } = useProjectDeletionHosts({
		projectId,
		hostIds,
		creatorByHostId,
	});
	const { hosts } = useKnownHosts();
	const { cache: workspacesCache } = useHostWorkspaces();
	const hostUrls = useHostUrls(hostIds);
	const targets = hostUrls.map((host) => {
		const hostAccess = access.find((entry) => entry.hostId === host.hostId);
		return {
			...host,
			name:
				hosts.find((known) => known.machineId === host.hostId)?.name ??
				(host.isLocal ? t({ message: "This device" }) : host.hostId),
			canDelete: hostAccess?.canDelete ?? false,
			inUseByOthers: hostAccess?.inUseByOthers ?? false,
			otherUsersWorkspaceCount: hostAccess?.otherUsersWorkspaceCount ?? 0,
			isOnline:
				host.url !== null &&
				(host.isLocal ||
					hosts.some(
						(known) => known.machineId === host.hostId && known.isOnline,
					)),
		};
	});
	const selection = selectedHostIds ?? defaultProjectDeletionSelection(targets);
	const reachableHosts = selectedProjectDeletionTargets(targets, selection);
	const [isDeleting, setIsDeleting] = useState(false);
	const deletionInFlight = useRef(false);

	const deleteProject = async (): Promise<boolean> => {
		if (deletionInFlight.current) return false;
		if (!permissionsReady || reachableHosts.length === 0) {
			toast.error(
				t({
					message: "No host serving this project is reachable right now",
				}),
			);
			return false;
		}
		deletionInFlight.current = true;
		setIsDeleting(true);
		try {
			const results = await Promise.allSettled(
				reachableHosts.map((host) =>
					getHostServiceClientByUrl(host.url).project.remove.mutate({
						projectId,
						acknowledgedOtherUsersWorkspaceCount: host.otherUsersWorkspaceCount,
					}),
				),
			);
			results.forEach((result, index) => {
				const host = reachableHosts[index];
				if (result.status === "rejected" && host)
					workspacesCache.invalidateHost(host.hostId);
			});
			const failed = results.filter((r) => r.status === "rejected");
			if (failed.length === results.length) {
				const first = failed[0] as PromiseRejectedResult;
				throw first.reason instanceof Error
					? first.reason
					: new Error(String(first.reason));
			}
			if (failed.length > 0) {
				toast.warning(
					t({
						message: `Deleted "${projectName}" from ${results.length - failed.length} of ${results.length} selected devices. Failed devices keep their copy.`,
					}),
				);
			} else {
				toast.success(
					t({
						message: `Deleted "${projectName}"`,
					}),
				);
			}
			if (failed.length > 0) return false;
			onDeleted?.();
			return true;
		} catch (err) {
			toast.error(
				errorMessage(
					err,
					t({
						message: "Failed to delete",
					}),
				),
			);
			return false;
		} finally {
			deletionInFlight.current = false;
			setIsDeleting(false);
		}
	};

	return {
		deleteProject,
		isDeleting,
		reachableHostCount: reachableHosts.length,
		targets,
		permissionsReady,
		defaultSelectedHostIds: defaultProjectDeletionSelection(targets),
		selectedHostIds: reachableHosts.map((host) => host.hostId),
	};
}
