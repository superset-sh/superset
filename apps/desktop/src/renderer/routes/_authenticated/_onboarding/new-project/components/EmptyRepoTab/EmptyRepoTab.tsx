import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useProjectCreationHandler } from "../../hooks/useProjectCreationHandler";

interface EmptyRepoTabProps {
	onError: (error: string) => void;
	parentDir: string;
}

export function EmptyRepoTab({ onError, parentDir }: EmptyRepoTabProps) {
	const [name, setName] = useState("");
	const createEmptyRepo = electronTrpc.projects.createEmptyRepo.useMutation();
	const { handleResult, handleError } = useProjectCreationHandler(onError);
	const isLoading = createEmptyRepo.isPending;

	const handleCreate = () => {
		const trimmed = name.trim();
		if (!trimmed) {
			onError("Please enter a repository name");
			return;
		}
		if (!parentDir.trim()) {
			onError("Please select a project location");
			return;
		}

		createEmptyRepo.mutate(
			{ name: trimmed, parentDir: parentDir.trim() },
			{
				onSuccess: (result) => handleResult(result, () => setName("")),
				onError: handleError,
			},
		);
	};

	return (
		<div className="flex flex-col gap-5">
			<div>
				<label
					htmlFor="repo-name"
					className="block text-sm font-medium text-foreground mb-2"
				>
					Repository Name
				</label>
				<Input
					id="repo-name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="my-project"
					disabled={isLoading}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !isLoading) {
							handleCreate();
						}
					}}
					autoFocus
				/>
			</div>
			<div className="flex justify-end pt-2 border-t border-border/40">
				<Button onClick={handleCreate} disabled={isLoading} size="sm">
					{isLoading ? "Creating..." : "Create"}
				</Button>
			</div>
		</div>
	);
}
