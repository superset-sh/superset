import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useHostUrls } from "renderer/hooks/host-service/useHostTargetUrl";
import { useKnownHosts } from "renderer/hooks/known-hosts/useKnownHosts";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useProjectDeletionHosts } from "renderer/routes/_authenticated/hooks/useProjectDeletionHosts";
import { useRestoreProject } from "renderer/routes/_authenticated/hooks/useRestoreProject";
import {
	isDeletableTarget,
	type ProjectDeletionTarget,
	summarizeOthersActivity,
} from "./useDeleteProject.utils";

const UNDO_TOAST_MS = 10_000;

interface UseDeleteProjectOptions {
	projectId: string;
	projectName: string;
	hostIds: string[];
	open: boolean;
	onDeleted?: () => void;
}

export function useDeleteProject({
	projectId,
	projectName,
	hostIds,
	open,
	onDeleted,
}: UseDeleteProjectOptions) {
	const { t } = useLingui();
	const permissions = useProjectDeletionHosts(hostIds);
	const { hosts } = useKnownHosts();
	const hostUrls = useHostUrls(hostIds);
	const restoreProject = useRestoreProject();
	const queryClient = useQueryClient();
	const targets: ProjectDeletionTarget[] = hostUrls.map((host) => {
		const known = hosts.find((entry) => entry.machineId === host.hostId);
		return {
			...host,
			name:
				known?.name ??
				(host.isLocal ? t({ message: "This device" }) : host.hostId),
			canDelete: permissions.hostIds.includes(host.hostId),
			isOnline: host.url !== null && (host.isLocal || !!known?.isOnline),
		};
	});
	const deletable = targets.filter(isDeletableTarget);
	const impact = useQueries({
		queries: deletable.map((target) => ({
			queryKey: ["project-deletion-impact", target.hostId, projectId],
			enabled: open,
			staleTime: 0,
			queryFn: () =>
				getHostServiceClientByUrl(target.url).project.deletionImpact.query({
					projectId,
				}),
		})),
	});
	const othersActivityByHost = new Map(
		deletable.map((target, index) => [
			target.hostId,
			summarizeOthersActivity(impact[index]?.data ?? [], permissions.userId),
		]),
	);
	const memberName = (userId: string | null) =>
		permissions.organizationMembers.find((member) => member.userId === userId)
			?.user.name ?? null;
	const [isDeleting, setIsDeleting] = useState(false);
	const inFlight = useRef(false);

	const deleteProject = async (selectedHostIds: string[]): Promise<boolean> => {
		if (inFlight.current) return false;
		const selected = deletable.filter((target) =>
			selectedHostIds.includes(target.hostId),
		);
		if (selected.length === 0) return false;
		inFlight.current = true;
		setIsDeleting(true);
		try {
			const results = await Promise.allSettled(
				selected.map((target) =>
					getHostServiceClientByUrl(target.url).project.remove.mutate({
						projectId,
					}),
				),
			);
			void queryClient.invalidateQueries({ queryKey: ["deleted-projects"] });
			const deletedUrls = selected
				.filter((_, index) => results[index]?.status === "fulfilled")
				.map((target) => target.url);
			const failed = results.find(
				(result): result is PromiseRejectedResult =>
					result.status === "rejected",
			);
			if (deletedUrls.length === 0 && failed) throw failed.reason;
			const undo = {
				label: t({ message: "Undo" }),
				onClick: () =>
					void restoreProject({
						projectId,
						projectName,
						hostUrls: deletedUrls,
					}),
			};
			if (failed) {
				toast.warning(
					t({
						message: `Deleted "${projectName}" from ${deletedUrls.length} of ${selected.length} devices. The others keep their copy.`,
					}),
					{ action: undo, duration: UNDO_TOAST_MS },
				);
				return false;
			}
			toast.success(
				t({
					message: `Deleted "${projectName}". You can restore it from Settings → Projects for 30 days.`,
				}),
				{ action: undo, duration: UNDO_TOAST_MS },
			);
			onDeleted?.();
			return true;
		} catch (err) {
			toast.error(errorMessage(err, t({ message: "Failed to delete" })));
			return false;
		} finally {
			inFlight.current = false;
			setIsDeleting(false);
		}
	};

	return {
		deleteProject,
		isDeleting,
		isReady: permissions.isReady,
		targets,
		othersActivityByHost,
		memberName,
	};
}
