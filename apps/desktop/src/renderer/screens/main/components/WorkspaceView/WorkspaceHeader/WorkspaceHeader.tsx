import { OpenInButton } from "renderer/components/OpenInButton";
import { trpc } from "renderer/lib/trpc";
import { BranchSelector } from "./components/BranchSelector";

interface WorkspaceHeaderProps {
	worktreePath: string | undefined;
}

export function WorkspaceHeader({ worktreePath }: WorkspaceHeaderProps) {
	// Replace home directory with ~ for display
	const displayPath = worktreePath?.replace(/^\/Users\/[^/]+/, "~") ?? null;

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
