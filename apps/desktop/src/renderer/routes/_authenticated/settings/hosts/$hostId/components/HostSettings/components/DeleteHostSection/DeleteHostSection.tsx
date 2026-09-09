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
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/useOptimisticActions";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

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
	const { t } = useLingui();
	const navigate = useNavigate();
	const searchQuery = useSettingsSearchQuery();
	const actions = useOptimisticActions();
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
			toast.success(
				t({
					message: `Deleted "${hostName}"`,
				}),
			);
		} catch {
			// The shared mutation runner reports the error, and the collection
			// restores the host without disrupting wherever the user navigated.
		}
	};

	return (
		<div className="flex items-center justify-between gap-8 py-2.5">
			<div className="min-w-0 flex-1">
				<p className="text-sm font-medium">
					<HighlightText
						text={t({
							message: "Delete host",
						})}
						query={searchQuery}
					/>
				</p>
				<p
					id={deleteHostDescriptionId}
					className="mt-0.5 text-xs text-muted-foreground"
				>
					<Trans>
						Deletes this host, its access, and its workspaces. Files on the
						machine stay.
					</Trans>
				</p>
				{isLocalHost ? (
					<p
						id={localHostDescriptionId}
						className="mt-0.5 text-xs text-muted-foreground"
					>
						<Trans>Stop Superset here to delete from another device.</Trans>
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
						<Trans>Delete host</Trans>
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent
					onOpenAutoFocus={(event) => {
						event.preventDefault();
						confirmationInputRef.current?.focus();
					}}
				>
					<AlertDialogHeader>
						<AlertDialogTitle>
							<Trans>Delete "{hostName}"?</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription>
							<Trans>
								This removes the host, its access, and its workspaces. Files on
								the machine stay. A running host may reappear. This can’t be
								undone.
							</Trans>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="space-y-2">
						<Label htmlFor={confirmationInputId} className="text-xs">
							<Trans>
								Type{" "}
								<span className="font-mono font-medium text-foreground">
									{hostName}
								</span>{" "}
								to confirm
							</Trans>
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
						<AlertDialogCancel disabled={isDeleting}>
							<Trans>Cancel</Trans>
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={(event) => {
								event.preventDefault();
								void handleDelete();
							}}
							disabled={isDeleting || !canDelete}
							aria-busy={isDeleting}
						>
							{isDeleting ? <Trans>Deleting…</Trans> : <Trans>Delete</Trans>}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
