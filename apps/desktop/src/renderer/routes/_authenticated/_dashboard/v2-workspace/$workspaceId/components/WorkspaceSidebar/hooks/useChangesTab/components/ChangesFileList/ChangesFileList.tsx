import { memo, useMemo } from "react";
import type { ChangesetFile } from "../../../../../../hooks/useChangeset";
import { FileRow } from "./components/FileRow";
import { partitionByViewed } from "./utils/partitionByViewed";

interface ChangesFileListProps {
	files: ChangesetFile[];
	isLoading?: boolean;
	onSelectFile?: (path: string) => void;
	viewedSet: Set<string>;
	onSetViewed: (path: string, next: boolean) => void;
}

export const ChangesFileList = memo(function ChangesFileList({
	files,
	isLoading,
	onSelectFile,
	viewedSet,
	onSetViewed,
}: ChangesFileListProps) {
	const sortedFiles = useMemo(
		() => partitionByViewed(files, viewedSet),
		[files, viewedSet],
	);

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
			{sortedFiles.map((file) => (
				<FileRow
					key={`${file.source.kind}:${file.path}`}
					file={file}
					onSelect={onSelectFile}
					viewed={viewedSet.has(file.path)}
					onSetViewed={onSetViewed}
				/>
			))}
		</div>
	);
});
