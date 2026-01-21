import { useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { CommitInfo } from "shared/changes-types";
import { FileDiffSection } from "../../../FileDiffSection";

interface CommitSectionProps {
	commit: CommitInfo;
	worktreePath: string;
	collapsedFiles: Set<string>;
	onToggleFile: (key: string) => void;
}

export function CommitSection({
	commit,
	worktreePath,
	collapsedFiles,
	onToggleFile,
}: CommitSectionProps) {
	const [isCommitExpanded, setIsCommitExpanded] = useState(true);

	const { data: commitFiles } = electronTrpc.changes.getCommitFiles.useQuery(
		{
			worktreePath,
			commitHash: commit.hash,
		},
		{ enabled: isCommitExpanded },
	);

	const files = commitFiles ?? [];

	return (
		<div className="border-b border-border">
			<button
				type="button"
				onClick={() => setIsCommitExpanded(!isCommitExpanded)}
				className="flex items-center gap-2 px-4 py-2 w-full text-left hover:bg-accent/50 transition-colors"
			>
				{isCommitExpanded ? (
					<LuChevronDown className="size-4 text-muted-foreground" />
				) : (
					<LuChevronRight className="size-4 text-muted-foreground" />
				)}
				<span className="text-xs font-mono text-muted-foreground">
					{commit.shortHash}
				</span>
				<span className="text-sm truncate flex-1">{commit.message}</span>
				<span className="text-xs text-muted-foreground">
					{commit.files.length} files
				</span>
			</button>
			{isCommitExpanded && (
				<div className="pl-4">
					{files.map((file) => {
						const fileKey = `committed:${commit.hash}:${file.path}`;
						return (
							<FileDiffSection
								key={fileKey}
								file={file}
								category="committed"
								commitHash={commit.hash}
								worktreePath={worktreePath}
								isExpanded={!collapsedFiles.has(fileKey)}
								onToggleExpanded={() => onToggleFile(fileKey)}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
}
