import { OpenInButton } from "renderer/components/OpenInButton";

interface WorkspaceHeaderProps {
	worktreePath: string | undefined;
}

export function WorkspaceHeader({ worktreePath }: WorkspaceHeaderProps) {
	const folderName = worktreePath
		? worktreePath.split("/").filter(Boolean).pop() || worktreePath
		: null;

	return (
		<div className="no-drag flex items-center">
			<OpenInButton
				path={worktreePath}
				label={folderName ?? undefined}
				showShortcuts
			/>
		</div>
	);
}
