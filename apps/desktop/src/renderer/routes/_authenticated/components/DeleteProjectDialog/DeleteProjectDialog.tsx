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
import { Checkbox } from "@superset/ui/checkbox";
import { type ReactNode, useEffect, useId, useState } from "react";
import { useDeleteProject } from "./useDeleteProject";

interface DeleteProjectDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectId: string;
	projectName: string;
	hostIds: string[];
	creatorByHostId: Record<string, string | null>;
	onDeleted?: () => void;
	/** Optional trigger, rendered `asChild`. */
	children?: ReactNode;
}

export function DeleteProjectDialog({
	open,
	onOpenChange,
	projectId,
	projectName,
	hostIds,
	creatorByHostId,
	onDeleted,
	children,
}: DeleteProjectDialogProps) {
	const deviceId = useId();
	const [selection, setSelection] = useState<string[] | undefined>();
	const {
		deleteProject,
		isDeleting,
		reachableHostCount,
		targets,
		permissionsReady,
		defaultSelectedHostIds,
		selectedHostIds,
	} = useDeleteProject({
		projectId,
		projectName,
		hostIds,
		creatorByHostId,
		selectedHostIds: selection,
		onDeleted,
	});

	useEffect(() => {
		if (!open) {
			setSelection(undefined);
			return;
		}
		if (selection === undefined && permissionsReady)
			setSelection(defaultSelectedHostIds);
	}, [open, permissionsReady, selection, defaultSelectedHostIds]);

	return (
		<AlertDialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (isDeleting) return;
				setSelection(undefined);
				onOpenChange(nextOpen);
			}}
		>
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
							<Trans>
								This removes the project and its workspaces from the selected
								devices for everyone using those devices. Worktrees are deleted
								from disk.
							</Trans>
						</span>
						<span className="block">
							<Trans>The repository folder itself is kept.</Trans>{" "}
							<Trans>
								Worktrees with uncommitted changes are left on disk.
							</Trans>
						</span>
						<span className="block">
							<Trans>Unselected devices keep their copy.</Trans>
						</span>
						<span className="block font-medium text-foreground">
							<Trans>This cannot be undone.</Trans>
						</span>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<fieldset disabled={isDeleting} className="space-y-2">
					<legend className="mb-2 text-sm font-medium">
						<Trans>Devices</Trans>
					</legend>
					<div className="max-h-56 overflow-y-auto space-y-2">
						{targets.map((target) => (
							<label
								key={target.hostId}
								htmlFor={`${deviceId}-${target.hostId}`}
								className="flex items-center gap-3 rounded-md border p-3 text-sm"
							>
								<Checkbox
									id={`${deviceId}-${target.hostId}`}
									checked={selectedHostIds.includes(target.hostId)}
									disabled={isDeleting || !target.canDelete || !target.isOnline}
									onCheckedChange={(checked) =>
										setSelection(
											checked
												? [...selectedHostIds, target.hostId]
												: selectedHostIds.filter((id) => id !== target.hostId),
										)
									}
								/>
								<span className="min-w-0 flex-1 break-words">
									<span className="block">{target.name}</span>
									{target.canDelete && target.otherUsersWorkspaceCount > 0 ? (
										<span className="block text-xs text-muted-foreground">
											<Plural
												value={target.otherUsersWorkspaceCount}
												one="Deletes # workspace other people are using"
												other="Deletes # workspaces other people are using"
											/>
										</span>
									) : null}
								</span>
								{target.inUseByOthers ? (
									<span className="text-xs text-muted-foreground">
										<Trans>In use by other people</Trans>
									</span>
								) : !target.canDelete ? (
									<span className="text-xs text-muted-foreground">
										<Trans>Owner access required</Trans>
									</span>
								) : !target.isOnline ? (
									<span className="text-xs text-muted-foreground">
										<Trans>Offline</Trans>
									</span>
								) : null}
							</label>
						))}
					</div>
				</fieldset>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isDeleting}>
						<Trans>Cancel</Trans>
					</AlertDialogCancel>
					<AlertDialogAction
						onClick={async (event) => {
							event.preventDefault();
							const deleted = await deleteProject();
							if (deleted) {
								setSelection(undefined);
								onOpenChange(false);
							}
						}}
						disabled={
							isDeleting || !permissionsReady || reachableHostCount === 0
						}
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					>
						{isDeleting ? <Trans>Deleting…</Trans> : <Trans>Delete</Trans>}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
