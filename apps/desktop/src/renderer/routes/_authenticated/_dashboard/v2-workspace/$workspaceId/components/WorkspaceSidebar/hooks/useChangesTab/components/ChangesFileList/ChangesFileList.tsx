import { memo } from "react";
import type { ChangesetFile } from "../../../../../../hooks/useChangeset";
import { FileRow } from "./components/FileRow";

interface ChangesFileListProps {
	files: ChangesetFile[];
	isLoading?: boolean;
	worktreePath?: string;
	onSelectFile?: (path: string, openInNewTab?: boolean) => void;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	onOpenInEditor?: (path: string) => void;
}

export const ChangesFileList = memo(function ChangesFileList({
	files,
	isLoading,
	worktreePath,
	onSelectFile,
	onOpenFile,
	onOpenInEditor,
}: ChangesFileListProps) {
	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Loading...
			</div>
		);
	}

	if (files.length === 0) {
		return (
			<div className="px-3 py-6 text-center text-sm text-muted-foreground">
				No changes
			</div>
		);
	}

	return (
		<div className="min-h-0 flex-1 overflow-y-auto">
			{files.map((file) => (
				<FileRow
					key={`${file.source.kind}:${file.path}`}
					file={file}
					worktreePath={worktreePath}
					onSelect={onSelectFile}
					onOpenFile={onOpenFile}
					onOpenInEditor={onOpenInEditor}
				/>
			))}
		</div>
	);
});
