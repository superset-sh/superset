import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useMemo, useState } from "react";
import { useHostUrls } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";

interface UseDeleteProjectOptions {
	projectId: string;
	projectName: string;
	/** Hosts serving this project — the delete fans out to each. */
	hostIds: string[];
	onDeleted?: () => void;
}

/**
 * Deletes a project from every reachable host that serves it. Projects are
 * local per host, so an unreachable host keeps its copy; the caller shows
 * that in the confirmation so nobody is surprised later.
 */
export function useDeleteProject({
	projectId,
	projectName,
	hostIds,
	onDeleted,
}: UseDeleteProjectOptions) {
	const { t } = useLingui();
	const hostUrls = useHostUrls(hostIds);
	const reachableHosts = useMemo(
		() =>
			hostUrls.filter(
				(host): host is { hostId: string; url: string; isLocal: boolean } =>
					host.url !== null,
			),
		[hostUrls],
	);
	const { workspaces } = useHostWorkspaces();
	// The main workspace is the repository checkout itself and survives;
	// only worktrees are removed from disk. Count only hosts the delete will
	// actually reach — an offline device keeps its worktrees, and the dialog
	// says so separately. A remote host keeps a relay URL while offline, so
	// the workspace's own reachability flag is the second gate.
	const worktreeCount = useMemo(() => {
		const reachableHostIds = new Set(reachableHosts.map((host) => host.hostId));
		return workspaces.filter(
			(workspace) =>
				workspace.projectId === projectId &&
				workspace.type === "worktree" &&
				workspace.hostReachable &&
				reachableHostIds.has(workspace.hostId),
		).length;
	}, [workspaces, projectId, reachableHosts]);
	const [isDeleting, setIsDeleting] = useState(false);

	const deleteProject = async (): Promise<boolean> => {
		if (reachableHosts.length === 0) {
			toast.error(
				t({
					message: "No host serving this project is reachable right now",
				}),
			);
			return false;
		}
		setIsDeleting(true);
		try {
			const results = await Promise.allSettled(
				reachableHosts.map((host) =>
					getHostServiceClientByUrl(host.url).project.remove.mutate({
						projectId,
					}),
				),
			);
			const failed = results.filter((r) => r.status === "rejected");
			if (failed.length === results.length) {
				const first = failed[0] as PromiseRejectedResult;
				throw first.reason instanceof Error
					? first.reason
					: new Error(String(first.reason));
			}
			const skipped = hostIds.length - reachableHosts.length;
			if (failed.length > 0 || skipped > 0) {
				toast.warning(
					t({
						message: `Deleted "${projectName}" from ${results.length - failed.length} of ${hostIds.length} devices — unreachable devices keep their copy`,
					}),
				);
			} else {
				toast.success(
					t({
						message: `Deleted "${projectName}"`,
					}),
				);
			}
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
			setIsDeleting(false);
		}
	};

	return {
		deleteProject,
		isDeleting,
		worktreeCount,
		reachableHostCount: reachableHosts.length,
		hostCount: hostIds.length,
	};
}
