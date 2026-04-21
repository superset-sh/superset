import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { useEffect, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

interface RepositorySectionProps {
	projectId: string;
	currentRepoCloneUrl: string | null;
}

export function RepositorySection({
	projectId,
	currentRepoCloneUrl,
}: RepositorySectionProps) {
	const [value, setValue] = useState(currentRepoCloneUrl ?? "");
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		setValue(currentRepoCloneUrl ?? "");
	}, [currentRepoCloneUrl]);

	const trimmed = value.trim();
	const hasChanged = trimmed !== (currentRepoCloneUrl ?? "");

	const handleSave = async () => {
		if (!hasChanged || isSaving) return;
		setIsSaving(true);
		try {
			await apiTrpcClient.v2Project.update.mutate({
				id: projectId,
				repoCloneUrl: trimmed === "" ? null : trimmed,
			});
			toast.success("Repository updated");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to update");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="flex items-center gap-2">
			<Input
				value={value}
				onChange={(e) => setValue(e.target.value)}
				placeholder="https://github.com/owner/repo"
				className="font-mono"
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						void handleSave();
					}
				}}
			/>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={handleSave}
				disabled={!hasChanged || isSaving}
			>
				{isSaving ? "Saving…" : "Save"}
			</Button>
		</div>
	);
}
