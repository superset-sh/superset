import { Button } from "@superset/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { HiChevronRight, HiMiniMinus, HiMiniPlus } from "react-icons/hi2";
import { LuGitBranch, LuUndo2 } from "react-icons/lu";
import type {
	ChangeCategory,
	ChangedFile,
	NestedRepoStatus,
} from "shared/changes-types";
import { CategorySection } from "../CategorySection";
import { FileList } from "../FileList";

interface RepoSectionProps {
	repo: NestedRepoStatus;
	worktreePath: string;
	isExpanded: boolean;
	onToggle: () => void;
	selectedFile: ChangedFile | null;
	selectedCommitHash: string | null;
	fileListViewMode: "grouped" | "tree";
	expandedSections: Record<ChangeCategory, boolean>;
	onToggleSection: (section: ChangeCategory) => void;
	onFileSelect: (
		file: ChangedFile,
		category: ChangeCategory,
		repoPath: string,
	) => void;
	onStageFile: (file: ChangedFile, repoPath: string) => void;
	onUnstageFile: (file: ChangedFile, repoPath: string) => void;
	onDiscard: (file: ChangedFile, repoPath: string) => void;
	onStageAll: (repoPath: string) => void;
	onUnstageAll: (repoPath: string) => void;
	onDiscardAllUnstaged: (repoPath: string) => void;
	onDiscardAllStaged: (repoPath: string) => void;
	isStaging: boolean;
	isUnstaging: boolean;
	isDiscarding: boolean;
	isExpandedView?: boolean;
	commitInput: ReactNode;
}

export function RepoSection({
	repo,
	worktreePath,
	isExpanded,
	onToggle,
	selectedFile,
	selectedCommitHash,
	fileListViewMode,
	expandedSections,
	onToggleSection,
	onFileSelect,
	onStageFile,
	onUnstageFile,
	onDiscard,
	onStageAll,
	onUnstageAll,
	onDiscardAllUnstaged,
	onDiscardAllStaged,
	isStaging,
	isUnstaging,
	isDiscarding,
	isExpandedView,
	commitInput,
}: RepoSectionProps) {
	const combinedUnstaged = [...repo.unstaged, ...repo.untracked];
	const totalChanges =
		repo.staged.length + repo.unstaged.length + repo.untracked.length;

	return (
		<Collapsible
			open={isExpanded}
			onOpenChange={onToggle}
			className="border-b border-border last:border-b-0"
		>
			<div className="group flex items-center min-w-0 bg-muted/30">
				<CollapsibleTrigger
					className={cn(
						"flex-1 flex items-center gap-1.5 px-2 py-2 text-left min-w-0",
						"hover:bg-accent/30 cursor-pointer transition-colors",
					)}
				>
					<HiChevronRight
						className={cn(
							"size-3.5 text-muted-foreground shrink-0 transition-transform duration-150",
							isExpanded && "rotate-90",
						)}
					/>
					<LuGitBranch className="size-3.5 text-muted-foreground shrink-0" />
					<span className="text-xs font-medium truncate">{repo.repoName}</span>
					{totalChanges > 0 && (
						<span className="text-[10px] text-muted-foreground shrink-0 ml-auto">
							{totalChanges} change{totalChanges !== 1 ? "s" : ""}
						</span>
					)}
				</CollapsibleTrigger>
			</div>

			<CollapsibleContent className="min-w-0 overflow-hidden">
				{commitInput}

				<CategorySection
					title="Staged"
					count={repo.staged.length}
					isExpanded={expandedSections.staged}
					onToggle={() => onToggleSection("staged")}
					actions={
						<div className="flex items-center gap-0.5">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
										onClick={() => onDiscardAllStaged(repo.repoPath)}
										disabled={isDiscarding}
									>
										<LuUndo2 className="w-3.5 h-3.5" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="bottom">
									Discard all staged
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="h-6 w-6"
										onClick={() => onUnstageAll(repo.repoPath)}
										disabled={isUnstaging}
									>
										<HiMiniMinus className="w-4 h-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="bottom">Unstage all</TooltipContent>
							</Tooltip>
						</div>
					}
				>
					<FileList
						files={repo.staged}
						viewMode={fileListViewMode}
						selectedFile={selectedFile}
						selectedCommitHash={selectedCommitHash}
						onFileSelect={(file) => onFileSelect(file, "staged", repo.repoPath)}
						onUnstage={(file) => onUnstageFile(file, repo.repoPath)}
						isActioning={isUnstaging}
						worktreePath={worktreePath}
						category="staged"
						isExpandedView={isExpandedView}
					/>
				</CategorySection>

				<CategorySection
					title="Unstaged"
					count={combinedUnstaged.length}
					isExpanded={expandedSections.unstaged}
					onToggle={() => onToggleSection("unstaged")}
					actions={
						<div className="flex items-center gap-0.5">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
										onClick={() => onDiscardAllUnstaged(repo.repoPath)}
										disabled={isDiscarding}
									>
										<LuUndo2 className="w-3.5 h-3.5" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="bottom">
									Discard all unstaged
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="h-6 w-6"
										onClick={() => onStageAll(repo.repoPath)}
										disabled={isStaging}
									>
										<HiMiniPlus className="w-4 h-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="bottom">Stage all</TooltipContent>
							</Tooltip>
						</div>
					}
				>
					<FileList
						files={combinedUnstaged}
						viewMode={fileListViewMode}
						selectedFile={selectedFile}
						selectedCommitHash={selectedCommitHash}
						onFileSelect={(file) =>
							onFileSelect(file, "unstaged", repo.repoPath)
						}
						onStage={(file) => onStageFile(file, repo.repoPath)}
						isActioning={isStaging || isDiscarding}
						worktreePath={worktreePath}
						onDiscard={(file) => onDiscard(file, repo.repoPath)}
						category="unstaged"
						isExpandedView={isExpandedView}
					/>
				</CategorySection>
			</CollapsibleContent>
		</Collapsible>
	);
}
