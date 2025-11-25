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
					if (result.success && result.project) {
						createWorkspace.mutate({ projectId: result.project.id });
						onClose();
						setUrl("");
					} else if (!result.success && result.error) {
						onError(result.error);
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
			<div className="bg-[#201E1C] border border-[#2A2827] rounded-lg p-8 w-full max-w-md shadow-2xl">
				<h2 className="text-xl font-normal text-[#eae8e6] mb-6">
					Clone Repository
				</h2>

				<div className="space-y-6">
					<div>
						<label
							htmlFor="repo-url"
							className="block text-xs font-normal text-[#a8a5a3] mb-2"
						>
							Repository URL
						</label>
						<input
							id="repo-url"
							type="text"
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							placeholder="https://github.com/user/repo.git"
							className="w-full px-3 py-2.5 bg-[#151110] border border-[#2A2827] rounded-md text-[#eae8e6] placeholder:text-[#a8a5a3]/50 focus:outline-none focus:border-[#3A3837] transition-colors"
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
							className="px-4 py-2 rounded-md border border-[#2A2827] text-[#eae8e6] hover:bg-[#2A2827] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={handleClone}
							disabled={isLoading}
							className="px-4 py-2 rounded-md bg-[#eae8e6] text-[#151110] hover:bg-[#d4d2d0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
						>
							{isLoading ? "Cloning..." : "Clone"}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
