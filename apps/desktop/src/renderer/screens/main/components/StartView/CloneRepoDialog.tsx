import { useState } from "react";
import { trpc } from "renderer/lib/trpc";
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
	const utils = trpc.useUtils();
	const cloneRepo = trpc.projects.cloneRepo.useMutation();
	const createWorkspace = useCreateWorkspace();

	const handleClone = async () => {
		if (!url.trim()) {
			onError("Please enter a repository URL");
			return;
		}

		cloneRepo.mutate(
			{ url: url.trim() },
			{
				onSuccess: (result) => {
					// User canceled the directory picker - silent no-op
					if (result.canceled) {
						return;
					}

					if (result.success && result.project) {
						// Invalidate recents so the new/updated project appears
						utils.projects.getRecents.invalidate();
						createWorkspace.mutate({ projectId: result.project.id });
						onClose();
						setUrl("");
					} else if (!result.success) {
						// Show user-friendly error message
						onError(result.error ?? "Failed to clone repository");
					}
				},
				onError: (err) => {
					onError(err.message || "Failed to clone repository");
				},
			},
		);
	};

	if (!isOpen) return null;

	const isLoading = cloneRepo.isPending || createWorkspace.isPending;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
			<div className="bg-card border border-border rounded-lg p-8 w-full max-w-md shadow-2xl">
				<h2 className="text-xl font-normal text-foreground mb-6">
					Clone Repository
				</h2>

				<div className="space-y-6">
					<div>
						<label
							htmlFor="repo-url"
							className="block text-xs font-normal text-muted-foreground mb-2"
						>
							Repository URL
						</label>
						<input
							id="repo-url"
							type="text"
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							placeholder="https://github.com/user/repo.git"
							className="w-full px-3 py-2.5 bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring transition-colors"
							disabled={isLoading}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !isLoading) {
									handleClone();
								}
							}}
						/>
					</div>

					<div className="flex gap-3 justify-end pt-2">
						<button
							type="button"
							onClick={onClose}
							disabled={isLoading}
							className="px-4 py-2 rounded-md border border-border text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={handleClone}
							disabled={isLoading}
							className="px-4 py-2 rounded-md bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
						>
							{isLoading ? "Cloning..." : "Clone"}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
