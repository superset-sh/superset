import { Plural, Trans } from "@lingui/react/macro";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@superset/ui/alert-dialog";
import type { ReactNode } from "react";
import { useDeleteProject } from "./useDeleteProject";

interface DeleteProjectDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectId: string;
	projectName: string;
	/** Hosts serving this project — the delete fans out to each. */
	hostIds: string[];
	onDeleted?: () => void;
	/** Optional trigger, rendered `asChild`. */
	children?: ReactNode;
}

/**
 * The one confirmation for deleting a project, shared by project settings and
 * the sidebar context menu. It spells out what actually happens — how many
 * worktrees leave the disk, which devices are offline and keep their copy —
 * because a delete is one right-click away and the host does not ask twice.
 */
export function DeleteProjectDialog({
	open,
	onOpenChange,
	projectId,
	projectName,
	hostIds,
	onDeleted,
	children,
}: DeleteProjectDialogProps) {
	const {
		deleteProject,
		isDeleting,
		worktreeCount,
		reachableHostCount,
		hostCount,
	} = useDeleteProject({ projectId, projectName, hostIds, onDeleted });
	const offlineHostCount = hostCount - reachableHostCount;

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			{children ? (
				<AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
			) : null}
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						<Trans>Delete "{projectName}"?</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription className="space-y-2">
						<span className="block">
							{worktreeCount > 0 ? (
								<Plural
									value={worktreeCount}
									one="This removes the project and its # workspace from every reachable device, and deletes that worktree from disk."
									other="This removes the project and its # workspaces from every reachable device, and deletes their worktrees from disk."
								/>
							) : (
								<Trans>
									This removes the project from every reachable device.
								</Trans>
							)}{" "}
							<Trans>The repository folder itself is kept.</Trans>
						</span>
						{worktreeCount > 0 ? (
							<span className="block">
								<Trans>
									Worktrees with uncommitted changes are left on disk.
								</Trans>
							</span>
						) : null}
						{offlineHostCount > 0 ? (
							<span className="block">
								<Plural
									value={offlineHostCount}
									one="# device is offline and keeps its copy."
									other="# devices are offline and keep their copy."
								/>
							</span>
						) : null}
						<span className="block font-medium text-foreground">
							<Trans>This cannot be undone.</Trans>
						</span>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isDeleting}>
						<Trans>Cancel</Trans>
					</AlertDialogCancel>
					<AlertDialogAction
						onClick={async (event) => {
							event.preventDefault();
							const deleted = await deleteProject();
							if (deleted) onOpenChange(false);
						}}
						disabled={isDeleting || reachableHostCount === 0}
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					>
						{isDeleting ? <Trans>Deleting…</Trans> : <Trans>Delete</Trans>}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
