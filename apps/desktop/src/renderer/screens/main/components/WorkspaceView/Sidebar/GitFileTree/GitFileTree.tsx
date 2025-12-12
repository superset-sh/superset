import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
import { useMemo, useState } from "react";
import { HiFolder, HiOutlineFolder } from "react-icons/hi2";
import { FileTreeView } from "./FileTreeView";
import { GroupedView } from "./GroupedView";
import type { GitFile, ViewMode } from "./types";
import { buildFileTree, groupFilesByFolder } from "./utils";

interface GitFileTreeProps {
	files?: GitFile[];
	onFileSelect?: (file: GitFile) => void;
	defaultMode?: ViewMode;
}

export function GitFileTree({
	files = [],
	onFileSelect,
	defaultMode = "tree",
}: GitFileTreeProps) {
	const [viewMode, setViewMode] = useState<ViewMode>(defaultMode);

	const fileTree = useMemo(() => buildFileTree(files), [files]);
	const groupedFiles = useMemo(() => groupFilesByFolder(files), [files]);

	const handleFileSelect = (
		file: GitFile | { path: string; status?: string },
	) => {
		if (onFileSelect && "id" in file) {
			onFileSelect(file as GitFile);
		}
	};

	return (
		<div className="flex flex-col h-full">
			{/* Mode Toggle */}
			<div className="flex items-center gap-2 px-3 py-2 border-b border-border">
				<ToggleGroup
					type="single"
					value={viewMode}
					onValueChange={(value) => {
						if (value) setViewMode(value as ViewMode);
					}}
					variant="outline"
					size="sm"
				>
					<ToggleGroupItem value="tree" aria-label="Tree view">
						<HiFolder className="w-4 h-4 mr-1.5" />
						Tree
					</ToggleGroupItem>
					<ToggleGroupItem value="grouped" aria-label="Grouped view">
						<HiOutlineFolder className="w-4 h-4 mr-1.5" />
						Grouped
					</ToggleGroupItem>
				</ToggleGroup>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-hidden">
				{viewMode === "tree" ? (
					<FileTreeView
						tree={fileTree}
						onFileSelect={(node) => {
							if (node.type === "file") {
								const file = files.find((f) => f.path === node.path);
								if (file) {
									handleFileSelect(file);
								}
							}
						}}
					/>
				) : (
					<GroupedView groups={groupedFiles} onFileSelect={handleFileSelect} />
				)}
			</div>
		</div>
	);
}
