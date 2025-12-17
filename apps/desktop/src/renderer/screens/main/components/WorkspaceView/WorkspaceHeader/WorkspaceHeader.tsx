import { OpenInButton } from "renderer/components/OpenInButton";
import { trpc } from "renderer/lib/trpc";
import { BranchSelector } from "./components/BranchSelector";
import { PathDisplay } from "./components/PathDisplay";

interface WorkspaceHeaderProps {
	worktreePath: string | undefined;
}

export function WorkspaceHeader({ worktreePath }: WorkspaceHeaderProps) {
	const folderName = worktreePath
		? worktreePath.split("/").filter(Boolean).pop() || worktreePath
		: null;

	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const currentBranch = activeWorkspace?.worktree?.branch;

	return (
		<div className="w-full text-sm flex items-center gap-3 bg-tertiary px-3 pt-1.5 pb-0.5">
			{/* Path display */}
			{worktreePath && <PathDisplay path={worktreePath} />}

			{/* Branch selector */}
			{currentBranch && worktreePath && (
				<BranchSelector
					worktreePath={worktreePath}
					currentBranch={currentBranch}
				/>
			)}

			<div className="ml-auto">
				<OpenInButton
					path={worktreePath}
					label={folderName ?? undefined}
					showShortcuts
				/>
			</div>
		</div>
	);
}
