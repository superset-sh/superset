import { memo } from "react";
import { StatusIndicator } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/StatusIndicator";
import { FileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils";
import type { ChangesetFile } from "../../../../../../../../hooks/useChangeset";

function splitPath(path: string): { dir: string; basename: string } {
	const lastSlash = path.lastIndexOf("/");
	if (lastSlash < 0) return { dir: "", basename: path };
	return {
		dir: `${path.slice(0, lastSlash)}/`,
		basename: path.slice(lastSlash + 1),
	};
}

interface FileRowProps {
	file: ChangesetFile;
	onSelect?: (path: string) => void;
}

export const FileRow = memo(function FileRow({ file, onSelect }: FileRowProps) {
	const { dir, basename } = splitPath(file.path);

	return (
		<button
			type="button"
			className="flex w-full items-center gap-1.5 py-1 pr-3 pl-3 text-left text-xs hover:bg-accent/50"
			onClick={() => onSelect?.(file.path)}
		>
			<FileIcon fileName={basename} className="size-3.5 shrink-0" />
			<span className="flex min-w-0 flex-1 items-baseline overflow-hidden">
				{dir && <span className="truncate text-muted-foreground">{dir}</span>}
				<span className="min-w-[120px] truncate font-medium text-foreground">
					{basename}
				</span>
			</span>
			<span className="ml-auto flex shrink-0 items-center gap-1.5">
				{(file.additions > 0 || file.deletions > 0) && (
					<span className="text-[10px] text-muted-foreground">
						{file.additions > 0 && (
							<span className="text-green-400">+{file.additions}</span>
						)}
						{file.additions > 0 && file.deletions > 0 && " "}
						{file.deletions > 0 && (
							<span className="text-red-400">-{file.deletions}</span>
						)}
					</span>
				)}
				<StatusIndicator status={file.status} />
			</span>
		</button>
	);
});
