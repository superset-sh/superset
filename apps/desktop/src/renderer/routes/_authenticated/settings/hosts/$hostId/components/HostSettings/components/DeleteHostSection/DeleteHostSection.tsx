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
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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

	const handleDelete = async () => {
		if (isLocalHost) return;

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
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<section className="space-y-3">
			<div>
				<h3 className="text-sm font-medium">Danger zone</h3>
				<p className="mt-0.5 text-sm text-muted-foreground">
					Deleting a host removes it and its synced workspace records from this
					organization. Automations targeting it will be paused. Files on the
					device are not deleted.
				</p>
			</div>

			<div className="flex items-center justify-between gap-8 rounded-lg border p-4">
				<div className="min-w-0 flex-1">
					<div className="text-sm font-medium">Delete host</div>
					{isLocalHost ? (
						<p className="mt-0.5 text-xs text-muted-foreground">
							This host is running on this device and would reconnect
							automatically. Stop Superset here, then delete it from another
							device.
						</p>
					) : null}
				</div>

				<AlertDialog open={isOpen} onOpenChange={setIsOpen}>
					<AlertDialogTrigger asChild>
						<Button
							type="button"
							variant="destructive"
							size="sm"
							className="shrink-0"
							disabled={isLocalHost || isDeleting}
						>
							Delete host
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete "{hostName}"?</AlertDialogTitle>
							<AlertDialogDescription>
								This removes the host and its synced workspace records for
								everyone in the organization. Automations targeting this host
								will be paused. Conversation history is kept, but its links to
								these workspaces are removed. If the host service is still
								running, it may reconnect and reappear. Files on the device will
								not be deleted. This cannot be undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel disabled={isDeleting}>
								Cancel
							</AlertDialogCancel>
							<AlertDialogAction
								onClick={(event) => {
									event.preventDefault();
									void handleDelete();
								}}
								disabled={isDeleting}
								className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							>
								{isDeleting ? "Deleting…" : "Delete"}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</section>
	);
}
