import { parseGitHubRemote } from "@superset/shared/github-remote";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { FaGithub } from "react-icons/fa";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface RepositorySectionProps {
	repoUrl: string | null;
}

/**
 * Read-only: the repository URL is derived from the repo's git remote by
 * the host and re-resolved on every import/setup — edit the remote in git
 * to change it.
 */
export function RepositorySection({ repoUrl }: RepositorySectionProps) {
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const parsed = repoUrl ? parseGitHubRemote(repoUrl) : null;

	return (
		<div className="relative w-96">
			<Input
				id="project-repo"
				value={repoUrl ?? ""}
				readOnly
				disabled
				placeholder="No git remote detected"
				className="w-full font-mono text-sm pr-9"
			/>
			{parsed && (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="absolute right-1 top-1 size-7 text-muted-foreground hover:text-foreground"
							onClick={() => openUrl.mutate(parsed.url)}
							aria-label="Open in GitHub"
						>
							<FaGithub className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Open in GitHub</TooltipContent>
				</Tooltip>
			)}
		</div>
	);
}
