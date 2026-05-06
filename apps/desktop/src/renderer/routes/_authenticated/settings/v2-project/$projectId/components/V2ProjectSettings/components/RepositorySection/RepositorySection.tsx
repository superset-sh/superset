import { parseGitHubRemote } from "@superset/shared/github-remote";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useEffect, useRef, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { electronTrpc } from "renderer/lib/electron-trpc";
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
	const isFocusedRef = useRef(false);
	const openUrl = electronTrpc.external.openUrl.useMutation();

	useEffect(() => {
		if (!isFocusedRef.current) {
			setValue(currentRepoCloneUrl ?? "");
		}
	}, [currentRepoCloneUrl]);

	const commit = () => {
		const trimmed = value.trim();
		const next = trimmed === "" ? null : trimmed;
		if (next === (currentRepoCloneUrl ?? null)) return;
		projectActions.updateRepository(projectId, next);
	};

	const parsed = currentRepoCloneUrl
		? parseGitHubRemote(currentRepoCloneUrl)
		: null;

	return (
		<div className="flex items-center gap-2">
			<Input
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onFocus={() => {
					isFocusedRef.current = true;
				}}
				onBlur={() => {
					isFocusedRef.current = false;
					commit();
				}}
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
				className="font-mono text-sm flex-1 min-w-0"
			/>
			{parsed && (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="shrink-0 gap-1.5"
					onClick={() => openUrl.mutate(parsed.url)}
				>
					<FaGithub className="size-4" />
					Open
				</Button>
			)}
		</div>
	);
}
