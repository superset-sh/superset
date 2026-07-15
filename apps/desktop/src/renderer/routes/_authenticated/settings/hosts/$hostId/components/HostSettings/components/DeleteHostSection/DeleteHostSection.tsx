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
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useOptimisticCollectionActions } from "renderer/routes/_authenticated/hooks/useOptimisticCollectionActions";

interface DeleteHostSectionProps {
	hostId: string;
	hostName: string;
	isLocalHost: boolean;
}

export function DeleteHostSection({
	hostId,
	hostName,
	isLocalHost,
}: DeleteHostSectionProps) {
	const navigate = useNavigate();
	const actions = useOptimisticCollectionActions();
	const [isDeleting, setIsDeleting] = useState(false);
	const [isOpen, setIsOpen] = useState(false);
	const [confirmation, setConfirmation] = useState("");
	const confirmationInputRef = useRef<HTMLInputElement>(null);
	const deleteHostDescriptionId = `delete-host-${hostId}-description`;
	const localHostDescriptionId = `delete-host-${hostId}-local-description`;
	const confirmationInputId = `delete-host-${hostId}-confirmation`;
	const canDelete = confirmation === hostName;
	const deleteButtonDescriptionIds = [
		deleteHostDescriptionId,
		isLocalHost ? localHostDescriptionId : null,
	]
		.filter(Boolean)
		.join(" ");

	useEffect(() => {
		if (!isOpen) setConfirmation("");
	}, [isOpen]);

	const handleDelete = async () => {
		if (isLocalHost || !canDelete) return;

		setIsDeleting(true);
		const transaction = actions.v2Hosts.deleteHost(hostId);
		if (!transaction) {
			setIsDeleting(false);
			return;
		}

		setIsOpen(false);
		await navigate({ to: "/settings/hosts", replace: true });

		try {
			await transaction.isPersisted.promise;
			toast.success(`Deleted "${hostName}"`);
		} catch {
			// The shared mutation runner reports the error, and the collection
			// restores the host without disrupting wherever the user navigated.
		}
	};

	return (
		<div className="flex items-center justify-between gap-8 py-2.5">
			<div className="min-w-0 flex-1">
				<p className="text-sm font-medium">Delete host</p>
				<p
					id={deleteHostDescriptionId}
					className="mt-0.5 text-xs text-muted-foreground"
				>
					Deletes this host and access. Workspaces, files, conversations, and
					automations stay.
				</p>
				{isLocalHost ? (
					<p
						id={localHostDescriptionId}
						className="mt-0.5 text-xs text-muted-foreground"
					>
						Stop Superset here to delete from another device.
					</p>
				) : null}
			</div>

			<AlertDialog open={isOpen} onOpenChange={setIsOpen}>
				<AlertDialogTrigger asChild>
					<Button
						type="button"
						variant="destructive"
						size="sm"
						aria-describedby={deleteButtonDescriptionIds}
						className="shrink-0"
						disabled={isLocalHost || isDeleting}
					>
						Delete host
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent
					onOpenAutoFocus={(event) => {
						event.preventDefault();
						confirmationInputRef.current?.focus();
					}}
				>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete "{hostName}"?</AlertDialogTitle>
						<AlertDialogDescription>
							This removes only the host and its access. Workspaces, files,
							conversations, and automations stay. A running host may reappear.
							This can’t be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="space-y-2">
						<Label htmlFor={confirmationInputId} className="text-xs">
							Type{" "}
							<span className="font-mono font-medium text-foreground">
								{hostName}
							</span>{" "}
							to confirm
						</Label>
						<Input
							ref={confirmationInputRef}
							id={confirmationInputId}
							value={confirmation}
							onChange={(event) => setConfirmation(event.target.value)}
							placeholder={hostName}
							autoComplete="off"
							spellCheck={false}
						/>
					</div>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={(event) => {
								event.preventDefault();
								void handleDelete();
							}}
							disabled={isDeleting || !canDelete}
							aria-busy={isDeleting}
						>
							{isDeleting ? "Deleting…" : "Delete"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
