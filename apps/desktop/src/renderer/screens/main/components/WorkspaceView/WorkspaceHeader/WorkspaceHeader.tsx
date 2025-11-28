import { HiFolder } from "react-icons/hi2";
import { OpenInDropdown } from "./OpenInDropdown";

interface WorkspaceHeaderProps {
	worktreePath: string;
}

export function WorkspaceHeader({ worktreePath }: WorkspaceHeaderProps) {
	// Extract just the folder name from the full path for display
	const folderName =
		worktreePath.split("/").filter(Boolean).pop() || worktreePath;

	return (
		<div className="flex items-center justify-between px-2 py-1.5 border-b border-border/50">
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<HiFolder className="size-4" />
				<span className="font-medium" title={worktreePath}>
					/{folderName}
				</span>
			</div>
			<OpenInDropdown worktreePath={worktreePath} />
		</div>
	);
}
