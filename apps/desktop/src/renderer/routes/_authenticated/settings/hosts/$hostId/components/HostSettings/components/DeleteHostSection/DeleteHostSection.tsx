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
	const localHostDescriptionId = `delete-host-${hostId}-local-description`;

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
		<section aria-labelledby="delete-host-heading" className="space-y-3">
			<h3 id="delete-host-heading" className="text-sm font-medium">
				Danger zone
			</h3>

			<div className="flex items-center justify-between gap-6 rounded-lg border px-4 py-3.5">
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium">Delete host</p>
					<p className="mt-0.5 text-xs text-muted-foreground">
						Remove this host from the organization.
					</p>
					{isLocalHost ? (
						<p
							id={localHostDescriptionId}
							className="mt-1.5 text-xs text-muted-foreground"
						>
							Stop Superset here to delete this host from another device.
						</p>
					) : null}
				</div>

				<AlertDialog open={isOpen} onOpenChange={setIsOpen}>
					<AlertDialogTrigger asChild>
						<Button
							type="button"
							variant="outline"
							size="sm"
							aria-describedby={
								isLocalHost ? localHostDescriptionId : undefined
							}
							className="shrink-0 border-destructive/30 text-destructive shadow-none hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive dark:border-destructive/30 dark:bg-transparent dark:hover:border-destructive/50 dark:hover:bg-destructive/10"
							disabled={isLocalHost || isDeleting}
						>
							Delete host
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent className="max-w-[400px] gap-4">
						<AlertDialogHeader className="gap-1.5">
							<AlertDialogTitle className="text-base font-medium tracking-tight">
								Delete “{hostName}”?
							</AlertDialogTitle>
							<AlertDialogDescription asChild>
								<div className="space-y-2 text-left text-sm text-muted-foreground">
									<p>This removes the host for everyone.</p>
									<ul className="list-disc space-y-0.5 pl-4 text-xs leading-5 marker:text-muted-foreground/50">
										<li>Synced workspace records removed</li>
										<li>Automations paused</li>
										<li>Device files kept</li>
									</ul>
									<p className="text-xs">
										Conversations stay; workspace links are removed. Running
										hosts may reappear.
									</p>
									<p className="text-xs text-foreground">
										This can’t be undone.
									</p>
								</div>
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter className="pt-1">
							<AlertDialogCancel
								disabled={isDeleting}
								className="h-8 border-transparent bg-transparent px-3 shadow-none hover:bg-accent dark:border-transparent dark:bg-transparent dark:hover:bg-accent/50"
							>
								Cancel
							</AlertDialogCancel>
							<AlertDialogAction
								variant="destructive"
								size="sm"
								onClick={(event) => {
									event.preventDefault();
									void handleDelete();
								}}
								disabled={isDeleting}
								aria-busy={isDeleting}
							>
								{isDeleting ? "Deleting…" : "Delete host"}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</section>
	);
}
