import { Trans, useLingui } from "@lingui/react/macro";
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
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { type ReactNode, useEffect, useId, useState } from "react";
import { DeletionDeviceRow } from "./components/DeletionDeviceRow";
import { useDeleteProject } from "./useDeleteProject";
import {
	defaultProjectDeletionSelection,
	isDeletableTarget,
} from "./useDeleteProject.utils";

interface DeleteProjectDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectId: string;
	projectName: string;
	hostIds: string[];
	onDeleted?: () => void;
	/** Offered as the no-impact alternative when the caller can hide the project. */
	onHide?: () => void;
	/** Optional trigger, rendered `asChild`. */
	children?: ReactNode;
}

export function DeleteProjectDialog({
	open,
	onOpenChange,
	projectId,
	projectName,
	hostIds,
	onDeleted,
	onHide,
	children,
}: DeleteProjectDialogProps) {
	const { t } = useLingui();
	const rowId = useId();
	const [selection, setSelection] = useState<string[] | undefined>();
	const [typedName, setTypedName] = useState("");
	const {
		deleteProject,
		isDeleting,
		isReady,
		targets,
		othersActivityByHost,
		memberName,
	} = useDeleteProject({ projectId, projectName, hostIds, open, onDeleted });

	useEffect(() => {
		if (!open) {
			setSelection(undefined);
			setTypedName("");
		} else if (selection === undefined && isReady) {
			setSelection(defaultProjectDeletionSelection(targets));
		}
	}, [open, isReady, selection, targets]);

	const selected = (selection ?? []).filter((hostId) =>
		targets.some(
			(target) => target.hostId === hostId && isDeletableTarget(target),
		),
	);
	const othersActive = selected.some(
		(hostId) => (othersActivityByHost.get(hostId)?.length ?? 0) > 0,
	);
	const confirmed = !othersActive || typedName.trim() === projectName;

	return (
		<AlertDialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!isDeleting) onOpenChange(nextOpen);
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
								This removes the project and its workspaces for everyone on the
								selected devices, and stops their terminals and agents.
							</Trans>
						</span>
						<span className="block">
							<Trans>
								You can restore it from Settings → Projects for 30 days. The
								repository folder is never deleted.
							</Trans>
						</span>
						{onHide ? (
							<span className="block">
								<Trans>
									Only want it out of your sidebar? Hide it instead. Nobody else
									is affected.
								</Trans>
							</span>
						) : null}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<fieldset disabled={isDeleting} className="space-y-2">
					<legend className="mb-2 text-sm font-medium">
						<Trans>Devices</Trans>
					</legend>
					<div className="max-h-56 space-y-2 overflow-y-auto">
						{targets.map((target) => (
							<DeletionDeviceRow
								key={target.hostId}
								id={`${rowId}-${target.hostId}`}
								target={target}
								checked={selected.includes(target.hostId)}
								disabled={isDeleting || !isDeletableTarget(target)}
								othersActivity={othersActivityByHost.get(target.hostId) ?? []}
								memberName={memberName}
								onCheckedChange={(checked) =>
									setSelection(
										checked
											? [...selected, target.hostId]
											: selected.filter((id) => id !== target.hostId),
									)
								}
							/>
						))}
					</div>
				</fieldset>
				{othersActive ? (
					<div className="space-y-2">
						<p className="text-sm">
							<Trans>
								Other people are using this project. Type{" "}
								<span className="font-medium">{projectName}</span> to confirm.
							</Trans>
						</p>
						<Input
							value={typedName}
							onChange={(event) => setTypedName(event.target.value)}
							aria-label={t({ message: "Project name" })}
							disabled={isDeleting}
						/>
					</div>
				) : null}
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isDeleting}>
						<Trans>Cancel</Trans>
					</AlertDialogCancel>
					{onHide ? (
						<Button
							type="button"
							variant="outline"
							disabled={isDeleting}
							onClick={() => {
								onHide();
								onOpenChange(false);
							}}
						>
							<Trans>Hide from sidebar</Trans>
						</Button>
					) : null}
					<AlertDialogAction
						onClick={async (event) => {
							event.preventDefault();
							if (await deleteProject(selected)) onOpenChange(false);
						}}
						disabled={isDeleting || selected.length === 0 || !confirmed}
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					>
						{isDeleting ? <Trans>Deleting…</Trans> : <Trans>Delete</Trans>}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
