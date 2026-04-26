import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useEffect, useRef, useState } from "react";
import { useOptimisticCollectionActions } from "renderer/routes/_authenticated/hooks/useOptimisticCollectionActions";

interface RepositorySectionProps {
	projectId: string;
	currentRepoCloneUrl: string | null;
}

export function RepositorySection({
	projectId,
	currentRepoCloneUrl,
}: RepositorySectionProps) {
	const { v2Projects: projectActions } = useOptimisticCollectionActions();
	const [isEditing, setIsEditing] = useState(false);
	const [value, setValue] = useState(currentRepoCloneUrl ?? "");
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

	const save = () => {
		const trimmed = value.trim();
		if (trimmed === (currentRepoCloneUrl ?? "")) {
			setIsEditing(false);
			return;
		}
		const transaction = projectActions.updateRepository(
			projectId,
			trimmed === "" ? null : trimmed,
		);
		if (transaction) {
			setIsEditing(false);
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
								save();
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
					>
						Cancel
					</Button>
					<Button type="button" size="sm" onClick={save}>
						Save
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
