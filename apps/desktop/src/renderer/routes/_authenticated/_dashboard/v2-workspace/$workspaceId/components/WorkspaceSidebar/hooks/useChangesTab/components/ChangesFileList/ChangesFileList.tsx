import type { AppRouter } from "@superset/host-service";
import { Checkbox } from "@superset/ui/checkbox";
import type { inferRouterOutputs } from "@trpc/server";
import { memo, type ReactNode, useMemo } from "react";
import {
	VscCopy,
	VscDiffAdded,
	VscDiffModified,
	VscDiffRemoved,
	VscDiffRenamed,
} from "react-icons/vsc";
import { FileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils";

type ChangedFile =
	inferRouterOutputs<AppRouter>["git"]["getStatus"]["againstBase"][number];
type FileStatus = ChangedFile["status"];
type ChangeCategory = "against-base" | "staged" | "unstaged";

const STATUS_COLORS: Record<FileStatus, string> = {
	added: "text-green-700 dark:text-green-400",
	copied: "text-purple-700 dark:text-purple-400",
	changed: "text-yellow-600 dark:text-yellow-400",
	deleted: "text-red-700 dark:text-red-500",
	modified: "text-yellow-600 dark:text-yellow-400",
	renamed: "text-blue-600 dark:text-blue-400",
	untracked: "text-green-700 dark:text-green-400",
};

function getStatusIcon(status: FileStatus): ReactNode {
	const iconClass = "w-3 h-3";
	switch (status) {
		case "added":
		case "untracked":
			return <VscDiffAdded className={iconClass} />;
		case "modified":
		case "changed":
			return <VscDiffModified className={iconClass} />;
		case "deleted":
			return <VscDiffRemoved className={iconClass} />;
		case "renamed":
			return <VscDiffRenamed className={iconClass} />;
		case "copied":
			return <VscCopy className={iconClass} />;
		default:
			return null;
	}
}

function StatusIndicator({ status }: { status: FileStatus }) {
	return (
		<span className={`shrink-0 flex items-center ${STATUS_COLORS[status]}`}>
			{getStatusIcon(status)}
		</span>
	);
}

function splitPath(path: string): { dir: string; basename: string } {
	const lastSlash = path.lastIndexOf("/");
	if (lastSlash < 0) return { dir: "", basename: path };
	return {
		dir: `${path.slice(0, lastSlash)}/`,
		basename: path.slice(lastSlash + 1),
	};
}

const FileRow = memo(function FileRow({
	file,
	category,
	onSelect,
	viewed,
	onSetViewed,
}: {
	file: ChangedFile;
	category: ChangeCategory;
	onSelect?: (path: string, category: ChangeCategory) => void;
	viewed: boolean;
	onSetViewed: (path: string, next: boolean) => void;
}) {
	const { dir, basename } = splitPath(file.path);

	return (
		<div
			className={`flex w-full items-center gap-1.5 pl-3 pr-3 py-1 text-left text-xs hover:bg-accent/50 ${
				viewed ? "opacity-60" : ""
			}`}
		>
			<Checkbox
				checked={viewed}
				onCheckedChange={(checked) => onSetViewed(file.path, checked === true)}
				onClick={(e) => e.stopPropagation()}
				className="size-3.5 shrink-0 border-muted-foreground/50"
				aria-label={viewed ? "Mark as not viewed" : "Mark as viewed"}
			/>
			<button
				type="button"
				className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
				onClick={() => onSelect?.(file.path, category)}
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
		</div>
	);
});

function partitionByViewed(
	files: ChangedFile[],
	viewedSet: Set<string>,
): ChangedFile[] {
	if (viewedSet.size === 0) return files;
	const unviewed: ChangedFile[] = [];
	const viewed: ChangedFile[] = [];
	for (const file of files) {
		if (viewedSet.has(file.path)) viewed.push(file);
		else unviewed.push(file);
	}
	return [...unviewed, ...viewed];
}

interface ChangesFileListProps {
	files: ChangedFile[];
	isLoading?: boolean;
	category?: ChangeCategory;
	onSelectFile?: (path: string, category: ChangeCategory) => void;
	viewedSet: Set<string>;
	onSetViewed: (path: string, next: boolean) => void;
}

export const ChangesFileList = memo(function ChangesFileList({
	files,
	isLoading,
	category = "against-base",
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
					key={file.path}
					file={file}
					category={category}
					onSelect={onSelectFile}
					viewed={viewedSet.has(file.path)}
					onSetViewed={onSetViewed}
				/>
			))}
		</div>
	);
});
