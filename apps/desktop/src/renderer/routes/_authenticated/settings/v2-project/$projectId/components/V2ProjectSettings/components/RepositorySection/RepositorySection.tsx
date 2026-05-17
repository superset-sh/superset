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
	const [validationError, setValidationError] = useState<string | null>(null);
	const isFocusedRef = useRef(false);
	const openUrl = electronTrpc.external.openUrl.useMutation();

	useEffect(() => {
		if (!isFocusedRef.current) {
			setValue(currentRepoCloneUrl ?? "");
			setValidationError(null);
		}
	}, [currentRepoCloneUrl]);

	const commit = () => {
		const trimmed = value.trim();
		const next = trimmed === "" ? null : trimmed;
		if (next === (currentRepoCloneUrl ?? null)) return;

		// Validate before sending to the server — parseGitHubRemote is the
		// same function the API uses, so this gives immediate feedback instead
		// of a silent BAD_REQUEST.
		if (next !== null && !parseGitHubRemote(next)) {
			setValidationError(
				"Enter a GitHub URL (e.g. https://github.com/owner/repo) or an SSH remote (e.g. git@github.com:owner/repo.git)",
			);
			return;
		}

		setValidationError(null);
		projectActions.updateRepository(projectId, next);
	};

	const parsed = currentRepoCloneUrl
		? parseGitHubRemote(currentRepoCloneUrl)
		: null;

	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-2">
				<Input
					value={value}
					onChange={(e) => {
						setValue(e.target.value);
						// Clear the error as soon as the user starts editing again.
						if (validationError) setValidationError(null);
					}}
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
							setValidationError(null);
							(e.target as HTMLInputElement).blur();
						}
					}}
					placeholder="https://github.com/owner/repo"
					className={`font-mono text-sm flex-1 min-w-0${validationError ? " border-destructive focus-visible:ring-destructive" : ""}`}
					aria-invalid={validationError !== null}
					aria-describedby={validationError ? "repo-url-error" : undefined}
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
			{validationError && (
				<p
					id="repo-url-error"
					className="text-xs text-destructive"
					role="alert"
				>
					{validationError}
				</p>
			)}
		</div>
	);
}
