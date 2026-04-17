import { GitBranch, Pencil } from "lucide-react";
import { useRef, useState } from "react";
import type { ChangesFilter } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import type { Branch, Commit } from "../../types";
import { BaseBranchSelector } from "../BaseBranchSelector";
import { CommitFilterDropdown } from "../CommitFilterDropdown";

interface ChangesHeaderProps {
	currentBranch: { name: string; aheadCount: number; behindCount: number };
	defaultBranchName: string;
	baseBranch: string | null;
	commitCount: number;
	totalFiles: number;
	totalAdditions: number;
	totalDeletions: number;
	filter: ChangesFilter;
	onFilterChange: (filter: ChangesFilter) => void;
	commits: Commit[];
	uncommittedCount: number;
	branches: Branch[];
	onBaseBranchChange: (branchName: string) => void;
	onRenameBranch: (newName: string) => void;
	canRename: boolean;
}

export function ChangesHeader({
	currentBranch,
	defaultBranchName,
	baseBranch,
	commitCount,
	totalFiles,
	totalAdditions,
	totalDeletions,
	onRenameBranch,
	canRename,
	filter,
	onFilterChange,
	commits,
	uncommittedCount,
	branches,
	onBaseBranchChange,
}: ChangesHeaderProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState(currentBranch.name);
	const inputRef = useRef<HTMLInputElement>(null);
	const skipBlurRef = useRef(false);

	const startEditing = () => {
		setEditValue(currentBranch.name);
		setIsEditing(true);
		skipBlurRef.current = false;
		requestAnimationFrame(() => inputRef.current?.select());
	};

	const handleSubmit = () => {
		const trimmed = editValue.trim();
		if (trimmed && trimmed !== currentBranch.name) {
			onRenameBranch(trimmed);
		}
		setIsEditing(false);
	};

	return (
		<div className="border-b border-border bg-muted/30 px-3 py-2.5 space-y-1.5">
			<div className="group flex items-center gap-1.5 text-xs">
				<GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
				{isEditing ? (
					<input
						ref={inputRef}
						value={editValue}
						onChange={(e) => setEditValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								skipBlurRef.current = true;
								handleSubmit();
							}
							if (e.key === "Escape") {
								skipBlurRef.current = true;
								setIsEditing(false);
							}
						}}
						onBlur={() => {
							if (skipBlurRef.current) return;
							handleSubmit();
						}}
						className="min-w-0 flex-1 truncate bg-transparent font-medium outline-none ring-1 ring-ring rounded-sm px-1"
					/>
				) : (
					<>
						<span className="truncate font-medium">{currentBranch.name}</span>
						{canRename && (
							<button
								type="button"
								onClick={startEditing}
								className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
							>
								<Pencil className="size-3" />
							</button>
						)}
					</>
				)}
			</div>

			<div className="text-[11px] text-muted-foreground">
				{commitCount} {commitCount === 1 ? "commit" : "commits"} from{" "}
				<BaseBranchSelector
					branches={branches}
					currentValue={baseBranch ?? defaultBranchName}
					onChange={onBaseBranchChange}
				/>
			</div>

			{currentBranch.aheadCount > 0 && currentBranch.behindCount > 0 && (
				<div className="text-[11px] text-muted-foreground">
					<div>Your branch and</div>
					<div className="font-medium text-foreground">
						origin/{currentBranch.name}
					</div>
					<div>have diverged</div>
					<div>
						{currentBranch.aheadCount} local not pushed,{" "}
						{currentBranch.behindCount} remote to pull
					</div>
				</div>
			)}
			{currentBranch.aheadCount > 0 && currentBranch.behindCount === 0 && (
				<div className="text-[11px] text-muted-foreground">
					<div>
						{currentBranch.aheadCount}{" "}
						{currentBranch.aheadCount === 1 ? "commit" : "commits"} ahead of
					</div>
					<div className="font-medium text-foreground">
						origin/{currentBranch.name}
					</div>
				</div>
			)}
			{currentBranch.behindCount > 0 && currentBranch.aheadCount === 0 && (
				<div className="text-[11px] text-muted-foreground">
					<div>
						{currentBranch.behindCount}{" "}
						{currentBranch.behindCount === 1 ? "commit" : "commits"} behind
					</div>
					<div className="font-medium text-foreground">
						origin/{currentBranch.name}
					</div>
				</div>
			)}

			<div className="flex items-center justify-between pt-0.5">
				<CommitFilterDropdown
					filter={filter}
					onFilterChange={onFilterChange}
					commits={commits}
					uncommittedCount={uncommittedCount}
				/>
				<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<span>{totalFiles} files changed</span>
					{(totalAdditions > 0 || totalDeletions > 0) && (
						<span>
							{totalAdditions > 0 && (
								<span className="text-green-400">+{totalAdditions}</span>
							)}
							{totalAdditions > 0 && totalDeletions > 0 && " "}
							{totalDeletions > 0 && (
								<span className="text-red-400">-{totalDeletions}</span>
							)}
						</span>
					)}
				</div>
			</div>
		</div>
	);
}
