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
import { authClient } from "renderer/lib/auth-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

interface DeleteProjectSectionProps {
	projectId: string;
	projectName: string;
}

export function DeleteProjectSection({
	projectId,
	projectName,
}: DeleteProjectSectionProps) {
	const navigate = useNavigate();
	const hostService = useLocalHostService();
	const { activeHostUrl } = hostService;
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
		if (!activeHostUrl) {
			showHostServiceUnavailableToast(hostService, {
				action: "delete the project",
			});
			return;
		}
		setIsDeleting(true);
		try {
			const client = getHostServiceClientByUrl(activeHostUrl);
			await client.project.remove.mutate({ projectId });
			toast.success(`Deleted "${projectName}"`);
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
								This deletes the project for{" "}
								<span className="font-medium text-foreground">everyone</span> in
								the organization and removes all of its workspaces from every
								member's device. This cannot be undone.
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
								disabled={isDeleting || !activeHostUrl}
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
