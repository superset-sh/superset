import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { useEffect, useRef, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

interface RepositorySectionProps {
	projectId: string;
	currentRepoCloneUrl: string | null;
}

export function RepositorySection({
	projectId,
	currentRepoCloneUrl,
}: RepositorySectionProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [value, setValue] = useState(currentRepoCloneUrl ?? "");
	const [isSaving, setIsSaving] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!isEditing) setValue(currentRepoCloneUrl ?? "");
	}, [currentRepoCloneUrl, isEditing]);

	const startEdit = () => {
		setIsEditing(true);
		setTimeout(() => inputRef.current?.focus(), 0);
	};

	const cancelEdit = () => {
		setValue(currentRepoCloneUrl ?? "");
		setIsEditing(false);
	};

	const save = async () => {
		if (isSaving) return;
		const trimmed = value.trim();
		if (trimmed === (currentRepoCloneUrl ?? "")) {
			setIsEditing(false);
			return;
		}
		setIsSaving(true);
		try {
			await apiTrpcClient.v2Project.update.mutate({
				id: projectId,
				repoCloneUrl: trimmed === "" ? null : trimmed,
			});
			toast.success("Repository updated");
			setIsEditing(false);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to update");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="flex items-center gap-2">
			{isEditing ? (
				<>
					<Input
						ref={inputRef}
						value={value}
						onChange={(e) => setValue(e.target.value)}
						placeholder="https://github.com/owner/repo"
						className="font-mono"
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								void save();
							} else if (e.key === "Escape") {
								e.preventDefault();
								cancelEdit();
							}
						}}
					/>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={cancelEdit}
						disabled={isSaving}
					>
						Cancel
					</Button>
					<Button type="button" size="sm" onClick={save} disabled={isSaving}>
						{isSaving ? "Saving…" : "Save"}
					</Button>
				</>
			) : (
				<>
					<span className="flex-1 text-sm font-mono break-all text-muted-foreground">
						{currentRepoCloneUrl ?? (
							<span className="italic">No repository linked</span>
						)}
					</span>
					<Button type="button" variant="outline" size="sm" onClick={startEdit}>
						Edit
					</Button>
				</>
			)}
		</div>
	);
}
