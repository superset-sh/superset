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
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
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
	const { activeHostUrl } = useLocalHostService();
	const [isDeleting, setIsDeleting] = useState(false);
	const [isOpen, setIsOpen] = useState(false);

	const handleDelete = async () => {
		if (!activeHostUrl) {
			toast.error("Host service not available");
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
		<div className="flex items-center justify-between gap-4">
			<p className="text-xs text-muted-foreground">
				Permanently delete this project from the organization. Workspaces and
				local clones on any host are not affected.
			</p>
			<AlertDialog open={isOpen} onOpenChange={setIsOpen}>
				<AlertDialogTrigger asChild>
					<Button type="button" variant="destructive" size="sm">
						Delete project
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete "{projectName}"?</AlertDialogTitle>
						<AlertDialogDescription>
							This removes the project from the organization. Anyone with access
							will lose it. This cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
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
		</div>
	);
}
