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
		<div className="space-y-1 border-b border-border bg-muted/30 px-3 py-2">
			<div className="group flex items-center gap-1.5 text-xs">
				<GitBranch className="size-3 shrink-0 text-muted-foreground" />
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
						className="min-w-0 flex-1 truncate rounded-sm bg-transparent px-1 font-medium outline-none ring-1 ring-ring"
					/>
				) : (
					<>
						<span className="min-w-0 truncate font-medium">
							{currentBranch.name}
						</span>
						{canRename && (
							<button
								type="button"
								onClick={startEditing}
								className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
							>
								<Pencil className="size-3" />
							</button>
						)}
						<span className="shrink-0 text-muted-foreground/60">from</span>
						<BaseBranchSelector
							branches={branches}
							currentValue={baseBranch ?? defaultBranchName}
							onChange={onBaseBranchChange}
						/>
					</>
				)}
			</div>

			<div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
				<CommitFilterDropdown
					filter={filter}
					onFilterChange={onFilterChange}
					commits={commits}
					uncommittedCount={uncommittedCount}
				/>
				<div className="flex shrink-0 items-center gap-1.5">
					<span>
						{totalFiles} {totalFiles === 1 ? "file" : "files"}
					</span>
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
