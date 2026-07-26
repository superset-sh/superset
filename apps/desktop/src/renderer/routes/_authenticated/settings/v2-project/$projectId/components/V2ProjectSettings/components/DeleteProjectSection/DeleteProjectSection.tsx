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
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useHostUrls } from "renderer/hooks/host-service/useHostTargetUrl";
import { authClient } from "renderer/lib/auth-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

interface DeleteProjectSectionProps {
	projectId: string;
	projectName: string;
	/** Hosts serving this project — the delete fans out to each. */
	hostIds: string[];
}

export function DeleteProjectSection({
	projectId,
	projectName,
	hostIds,
}: DeleteProjectSectionProps) {
	const navigate = useNavigate();
	const hostUrls = useHostUrls(hostIds);
	const reachableHosts = hostUrls.filter(
		(host): host is { hostId: string; url: string; isLocal: boolean } =>
			host.url !== null,
	);
	const { data: session } = authClient.useSession();
	const { data: activeOrg } = authClient.useActiveOrganization();
	const currentUserId = session?.user?.id;
	const currentMember = activeOrg?.members?.find(
		(m) => m.userId === currentUserId,
	);
	const isOwner = currentMember?.role === "owner";
	const [isDeleting, setIsDeleting] = useState(false);
	const [isOpen, setIsOpen] = useState(false);

	const handleDelete = async () => {
		if (reachableHosts.length === 0) {
			toast.error("No host serving this project is reachable right now");
			return;
		}
		setIsDeleting(true);
		try {
			// Projects are local per host — delete on every serving host.
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
					`Deleted "${projectName}" from ${results.length - failed.length} of ${hostIds.length} devices — unreachable devices keep their copy`,
				);
			} else {
				toast.success(`Deleted "${projectName}"`);
			}
			setIsOpen(false);
			navigate({ to: "/settings/projects" });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to delete");
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<div className="flex items-center justify-between gap-8 py-2.5">
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium">Delete project</div>
			</div>
			{!isOwner ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<span>
							<Button
								type="button"
								variant="destructive"
								size="sm"
								className="pointer-events-none shrink-0"
								disabled
							>
								Delete project
							</Button>
						</span>
					</TooltipTrigger>
					<TooltipContent side="left">
						Only organization owners can delete this project.
					</TooltipContent>
				</Tooltip>
			) : (
				<AlertDialog open={isOpen} onOpenChange={setIsOpen}>
					<AlertDialogTrigger asChild>
						<Button
							type="button"
							variant="destructive"
							size="sm"
							className="shrink-0"
						>
							Delete project
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete "{projectName}"?</AlertDialogTitle>
							<AlertDialogDescription>
								This deletes the project and all of its workspaces from{" "}
								<span className="font-medium text-foreground">
									every reachable device
								</span>{" "}
								where it is set up. This cannot be undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel disabled={isDeleting}>
								Cancel
							</AlertDialogCancel>
							<AlertDialogAction
								onClick={(e) => {
									e.preventDefault();
									handleDelete();
								}}
								disabled={isDeleting || reachableHosts.length === 0}
								className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							>
								{isDeleting ? "Deleting…" : "Delete"}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			)}
		</div>
	);
}
