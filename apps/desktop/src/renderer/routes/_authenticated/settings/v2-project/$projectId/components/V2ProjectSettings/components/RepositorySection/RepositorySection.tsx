import { Input } from "@superset/ui/input";
import { useEffect, useState } from "react";
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
	const [value, setValue] = useState(currentRepoCloneUrl ?? "");

	useEffect(() => {
		setValue(currentRepoCloneUrl ?? "");
	}, [currentRepoCloneUrl]);

	const commit = () => {
		const trimmed = value.trim();
		const next = trimmed === "" ? null : trimmed;
		if (next === (currentRepoCloneUrl ?? null)) return;
		projectActions.updateRepository(projectId, next);
	};

	return (
		<Input
			value={value}
			onChange={(e) => setValue(e.target.value)}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					(e.target as HTMLInputElement).blur();
				}
				if (e.key === "Escape") {
					e.preventDefault();
					setValue(currentRepoCloneUrl ?? "");
					(e.target as HTMLInputElement).blur();
				}
			}}
			placeholder="https://github.com/owner/repo"
			className="font-mono text-sm"
		/>
	);
}
