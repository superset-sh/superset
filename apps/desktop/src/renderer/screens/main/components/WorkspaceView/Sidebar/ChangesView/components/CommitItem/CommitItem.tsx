import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { HiChevronDown, HiChevronRight } from "react-icons/hi2";
import type { ChangedFile, CommitInfo } from "shared/changes-types";
import { FileItem } from "../FileItem";

interface CommitItemProps {
	commit: CommitInfo;
	isExpanded: boolean;
	onToggle: () => void;
	selectedFile: ChangedFile | null;
	selectedCommitHash: string | null;
	onFileSelect: (file: ChangedFile, commitHash: string) => void;
}

function formatRelativeDate(date: Date): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMinutes = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffMinutes < 1) return "just now";
	if (diffMinutes < 60) return `${diffMinutes}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;
	return date.toLocaleDateString();
}

export function CommitItem({
	commit,
	isExpanded,
	onToggle,
	selectedFile,
	selectedCommitHash,
	onFileSelect,
}: CommitItemProps) {
	const hasFiles = commit.files.length > 0;

	return (
		<Collapsible open={isExpanded} onOpenChange={onToggle}>
			{/* Commit header */}
			<CollapsibleTrigger
				className={cn(
					"w-full flex items-center gap-2 px-2 py-1.5 text-left rounded-sm",
					"hover:bg-accent/50 cursor-pointer transition-colors",
				)}
			>
				{isExpanded ? (
					<HiChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
				) : (
					<HiChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
				)}

				{/* Commit hash */}
				<span className="text-xs font-mono text-muted-foreground flex-shrink-0">
					{commit.shortHash}
				</span>

				{/* Commit message */}
				<span className="text-sm flex-1 truncate">{commit.message}</span>

				{/* Relative date */}
				<span className="text-xs text-muted-foreground flex-shrink-0">
					{formatRelativeDate(commit.date)}
				</span>
			</CollapsibleTrigger>

			{/* Files in commit (when expanded) */}
			{hasFiles && (
				<CollapsibleContent className="ml-4 pl-2 border-l border-border">
					{commit.files.map((file) => (
						<FileItem
							key={file.path}
							file={file}
							isSelected={
								selectedCommitHash === commit.hash &&
								selectedFile?.path === file.path
							}
							onClick={() => onFileSelect(file, commit.hash)}
							showStats={false}
						/>
					))}
				</CollapsibleContent>
			)}
		</Collapsible>
	);
}
