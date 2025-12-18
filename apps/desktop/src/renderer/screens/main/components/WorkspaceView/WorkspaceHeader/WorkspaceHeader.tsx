import { OpenInButton } from "renderer/components/OpenInButton";
import { trpc } from "renderer/lib/trpc";
import { BranchSelector } from "./components/BranchSelector";

interface WorkspaceHeaderProps {
	worktreePath: string | undefined;
}

function shortenHomePath(path: string | undefined): string | null {
	if (!path) return null;

	const homePath = window.App.homePath;
	if (!homePath) return path;

	const normalizedPath = path.replace(/\\/g, "/");
	const normalizedHome = homePath.replace(/\\/g, "/");

	if (normalizedPath.startsWith(normalizedHome)) {
		const remainder = path.slice(homePath.length);
		return `~${remainder}`;
	}

	return path;
}

export function WorkspaceHeader({ worktreePath }: WorkspaceHeaderProps) {
	const displayPath = shortenHomePath(worktreePath);

	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const currentBranch = activeWorkspace?.worktree?.branch;

	return (
		<div className="w-full text-sm flex items-center gap-3 bg-tertiary px-3 pt-1.5 pb-0.5">
			{worktreePath && (
				<OpenInButton
					path={worktreePath}
					label={displayPath ?? undefined}
					showShortcuts
				/>
			)}
			{currentBranch && worktreePath && (
				<BranchSelector
					worktreePath={worktreePath}
					currentBranch={currentBranch}
				/>
			)}
		</div>
	);
}
