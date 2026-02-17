import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useProjectCreationHandler } from "../../hooks/useProjectCreationHandler";

interface CloneRepoTabProps {
	onClose: () => void;
	onError: (error: string) => void;
}

export function CloneRepoTab({ onClose, onError }: CloneRepoTabProps) {
	const [url, setUrl] = useState("");
	const cloneRepo = electronTrpc.projects.cloneRepo.useMutation();
	const { handleResult, handleError, isCreatingWorkspace } =
		useProjectCreationHandler(onClose, onError);

	const isLoading = cloneRepo.isPending || isCreatingWorkspace;

	const handleClone = () => {
		if (!url.trim()) {
			onError("Please enter a repository URL");
			return;
		}

		cloneRepo.mutate(
			{ url: url.trim() },
			{
				onSuccess: (result) => handleResult(result, () => setUrl("")),
				onError: handleError,
			},
		);
	};

	return (
		<div className="flex flex-col gap-4 px-4 pb-4">
			<div>
				<label
					htmlFor="clone-url"
					className="block text-sm font-medium text-foreground mb-2"
				>
					Repository URL
				</label>
				<Input
					id="clone-url"
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
			<div className="flex justify-end gap-2">
				<Button onClick={handleClone} disabled={isLoading} size="sm">
					{isLoading ? "Cloning..." : "Clone"}
				</Button>
			</div>
		</div>
	);
}
