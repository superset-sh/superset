import type { AppRouter } from "@superset/host-service";
import type { inferRouterOutputs } from "@trpc/server";
import { ChevronDown, ChevronRight } from "lucide-react";
import { memo, type ReactNode, useMemo, useState } from "react";
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
	added: "text-diff-added",
	copied: "text-diff-copied",
	changed: "text-diff-modified",
	deleted: "text-diff-deleted",
	modified: "text-diff-modified",
	renamed: "text-diff-renamed",
	untracked: "text-diff-added",
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

function groupByFolder(
	files: ChangedFile[],
): Array<{ folder: string; files: ChangedFile[] }> {
	const map = new Map<string, ChangedFile[]>();
	for (const file of files) {
		const lastSlash = file.path.lastIndexOf("/");
		const folder = lastSlash > 0 ? file.path.slice(0, lastSlash) : "";
		const existing = map.get(folder);
		if (existing) existing.push(file);
		else map.set(folder, [file]);
	}
	return Array.from(map.entries()).map(([folder, files]) => ({
		folder,
		files,
	}));
}

function StatusIndicator({ status }: { status: FileStatus }) {
	return (
		<span className={`shrink-0 flex items-center ${STATUS_COLORS[status]}`}>
			{getStatusIcon(status)}
		</span>
	);
}

const FileRow = memo(function FileRow({
	file,
	category,
	onSelect,
}: {
	file: ChangedFile;
	category: ChangeCategory;
	onSelect?: (path: string, category: ChangeCategory) => void;
}) {
	const fileName = file.path.split("/").pop() ?? file.path;

	return (
		<button
			type="button"
			className="flex w-full items-center gap-1.5 pl-6 pr-3 py-1 text-left text-xs hover:bg-accent/50"
			onClick={() => onSelect?.(file.path, category)}
		>
			<FileIcon fileName={fileName} className="size-3.5 shrink-0" />
			<span className="truncate font-medium">{fileName}</span>
			<span className="ml-auto flex items-center gap-1.5 shrink-0">
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

const FolderGroup = memo(function FolderGroup({
	folder,
	files,
	category,
	onSelectFile,
}: {
	folder: string;
	files: ChangedFile[];
	category: ChangeCategory;
	onSelectFile?: (path: string, category: ChangeCategory) => void;
}) {
	// Shorten long folder paths
	const displayFolder =
		folder.length > 40 ? `...${folder.slice(folder.length - 37)}` : folder;

	return (
		<div>
			{folder && (
				<div className="flex items-center gap-1 px-3 py-1 text-[11px] text-muted-foreground">
					<span className="truncate">{displayFolder}</span>
					<span className="shrink-0">{files.length}</span>
				</div>
			)}
			{files.map((file) => (
				<FileRow
					key={file.path}
					file={file}
					category={category}
					onSelect={onSelectFile}
				/>
			))}
		</div>
	);
});

function Section({
	title,
	files,
	category,
	defaultOpen,
	onSelectFile,
}: {
	title: string;
	files: ChangedFile[];
	category: ChangeCategory;
	defaultOpen: boolean;
	onSelectFile?: (path: string, category: ChangeCategory) => void;
}) {
	const [isOpen, setIsOpen] = useState(defaultOpen);
	const groups = useMemo(() => groupByFolder(files), [files]);

	if (files.length === 0) return null;

	return (
		<div>
			<button
				type="button"
				className="flex w-full items-center gap-1 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent/50"
				onClick={() => setIsOpen(!isOpen)}
			>
				{isOpen ? (
					<ChevronDown className="size-3" />
				) : (
					<ChevronRight className="size-3" />
				)}
				<span>{title}</span>
				<span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
					{files.length}
				</span>
			</button>
			{isOpen &&
				groups.map((group) => (
					<FolderGroup
						key={group.folder}
						folder={group.folder}
						files={group.files}
						category={category}
						onSelectFile={onSelectFile}
					/>
				))}
		</div>
	);
}

interface ChangesFileListProps {
	files: ChangedFile[];
	staged?: ChangedFile[];
	unstaged?: ChangedFile[];
	defaultBranchName?: string;
	isLoading?: boolean;
	category?: ChangeCategory;
	onSelectFile?: (path: string, category: ChangeCategory) => void;
}

export const ChangesFileList = memo(function ChangesFileList({
	files,
	staged,
	unstaged,
	defaultBranchName,
	isLoading,
	category = "against-base",
	onSelectFile,
}: ChangesFileListProps) {
	const groups = useMemo(() => groupByFolder(files), [files]);

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Loading...
			</div>
		);
	}

	const totalFiles =
		files.length + (staged?.length ?? 0) + (unstaged?.length ?? 0);

	if (totalFiles === 0) {
		return (
			<div className="px-3 py-6 text-center text-sm text-muted-foreground">
				No changes
			</div>
		);
	}

	if (staged !== undefined && unstaged !== undefined) {
		return (
			<div className="min-h-0 flex-1 overflow-y-auto">
				<Section
					title={`Against ${defaultBranchName ?? "base"}`}
					files={files}
					category="against-base"
					defaultOpen={true}
					onSelectFile={onSelectFile}
				/>
				<Section
					title="Staged"
					files={staged}
					category="staged"
					defaultOpen={true}
					onSelectFile={onSelectFile}
				/>
				<Section
					title="Unstaged"
					files={unstaged}
					category="unstaged"
					defaultOpen={true}
					onSelectFile={onSelectFile}
				/>
			</div>
		);
	}

	return (
		<div className="min-h-0 flex-1 overflow-y-auto">
			{groups.map((group) => (
				<FolderGroup
					key={group.folder}
					folder={group.folder}
					files={group.files}
					category={category}
					onSelectFile={onSelectFile}
				/>
			))}
		</div>
	);
});
