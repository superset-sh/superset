import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCreateWorkspace } from "renderer/react-query/workspaces";

interface CloneRepoDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onError: (error: string) => void;
}

export function CloneRepoDialog({
	isOpen,
	onClose,
	onError,
}: CloneRepoDialogProps) {
	const [url, setUrl] = useState("");
	const utils = electronTrpc.useUtils();
	const cloneRepo = electronTrpc.projects.cloneRepo.useMutation();
	const createWorkspace = useCreateWorkspace();

	const isLoading = cloneRepo.isPending || createWorkspace.isPending;

	const handleClone = async () => {
		if (!url.trim()) {
			onError("Please enter a repository URL");
			return;
		}

		cloneRepo.mutate(
			{ url: url.trim() },
			{
				onSuccess: (result) => {
					if (result.canceled) {
						return;
					}

					if (result.success && result.project) {
						utils.projects.getRecents.invalidate();
						createWorkspace.mutate({ projectId: result.project.id });
						onClose();
						setUrl("");
					} else if (!result.success) {
						onError(result.error ?? "Failed to clone repository");
					}
				},
				onError: (err) => {
					onError(err.message || "Failed to clone repository");
				},
			},
		);
	};

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Clone Repository</DialogTitle>
					<DialogDescription>
						Enter a repository URL to clone it locally.
					</DialogDescription>
				</DialogHeader>

				<div>
					<label
						htmlFor="repo-url"
						className="block text-sm font-medium text-foreground mb-2"
					>
						Repository URL
					</label>
					<Input
						id="repo-url"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder="https:// or git@github.com:user/repo.git"
						disabled={isLoading}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !isLoading) {
								handleClone();
							}
						}}
						autoFocus
					/>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={onClose} disabled={isLoading}>
						Cancel
					</Button>
					<Button onClick={handleClone} disabled={isLoading}>
						{isLoading ? "Cloning..." : "Clone"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
