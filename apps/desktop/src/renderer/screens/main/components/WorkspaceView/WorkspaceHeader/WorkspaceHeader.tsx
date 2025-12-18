import { OpenInButton } from "renderer/components/OpenInButton";
import { shortenHomePath } from "renderer/lib/formatPath";
import { trpc } from "renderer/lib/trpc";
import { BranchSelector } from "./components/BranchSelector";

interface WorkspaceHeaderProps {
	worktreePath: string | undefined;
}

export function WorkspaceHeader({ worktreePath }: WorkspaceHeaderProps) {
	const { data: homeDir } = trpc.window.getHomeDir.useQuery();
	const displayPath = worktreePath
		? shortenHomePath(worktreePath, homeDir)
		: null;

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
