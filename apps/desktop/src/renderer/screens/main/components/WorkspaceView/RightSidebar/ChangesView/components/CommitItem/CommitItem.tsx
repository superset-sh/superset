import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuClipboard } from "react-icons/lu";
import type { ChangedFile, CommitInfo } from "shared/changes-types";
import type { ChangesViewMode } from "../../types";
import { formatRelativeDate } from "../../utils";
import { CollapsibleRow } from "../CollapsibleRow";
import { FileList } from "../FileList";

interface CommitItemProps {
	commit: CommitInfo;
	isExpanded: boolean;
	onToggle: () => void;
	selectedFile: ChangedFile | null;
	selectedCommitHash: string | null;
	onFileSelect: (file: ChangedFile, commitHash: string) => void;
	viewMode: ChangesViewMode;
	worktreePath: string;
	isExpandedView?: boolean;
	projectId?: string;
}

function CommitHeader({
	hash,
	shortHash,
	message,
	date,
}: {
	hash: string;
	shortHash: string;
	message: string;
	date: Date;
}) {
	const handleCopyCommitHash = () => {
		void navigator.clipboard.writeText(hash);
	};

	return (
		<ContextMenu>
			<Tooltip>
				<TooltipTrigger asChild>
					<ContextMenuTrigger asChild>
						<div className="flex min-w-0 flex-1 items-center gap-1.5">
							<span className="text-[10px] font-mono text-muted-foreground shrink-0">
								{shortHash}
							</span>
							<span className="text-xs flex-1 truncate">{message}</span>
							<span className="text-[10px] text-muted-foreground shrink-0">
								{formatRelativeDate(date)}
							</span>
						</div>
					</ContextMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="right">{message}</TooltipContent>
			</Tooltip>
			<ContextMenuContent className="w-52">
				<ContextMenuItem onClick={handleCopyCommitHash}>
					<LuClipboard className="mr-2 size-4" />
					Copy Commit Hash
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

export function CommitItem({
	commit,
	isExpanded,
	onToggle,
	selectedFile,
	selectedCommitHash,
	onFileSelect,
	viewMode,
	worktreePath,
	isExpandedView,
	projectId,
}: CommitItemProps) {
	const hasFiles = commit.files.length > 0;

	const handleFileSelect = (file: ChangedFile) => {
		onFileSelect(file, commit.hash);
	};

	const isCommitSelected = selectedCommitHash === commit.hash;

	return (
		<CollapsibleRow
			isExpanded={isExpanded}
			onToggle={() => onToggle()}
			triggerClassName="mx-0.5"
			contentClassName="ml-4 pl-1.5 border-l border-border mt-0.5 mb-0.5"
			header={
				<CommitHeader
					hash={commit.hash}
					shortHash={commit.shortHash}
					message={commit.message}
					date={commit.date}
				/>
			}
		>
			{hasFiles && (
				<FileList
					files={commit.files}
					viewMode={viewMode}
					selectedFile={isCommitSelected ? selectedFile : null}
					selectedCommitHash={selectedCommitHash}
					onFileSelect={handleFileSelect}
					worktreePath={worktreePath}
					projectId={projectId}
					category="committed"
					commitHash={commit.hash}
					isExpandedView={isExpandedView}
				/>
			)}
		</CollapsibleRow>
	);
}
