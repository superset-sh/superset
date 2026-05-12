import { GitBranch, Pencil } from "lucide-react";
import { useRef, useState } from "react";
import type { Branch } from "../../types";
import { BaseBranchSelector } from "../BaseBranchSelector";

interface ChangesHeaderProps {
	currentBranch: { name: string; aheadCount: number; behindCount: number };
	defaultBranchName: string;
	baseBranch: string | null;
	branches: Branch[];
	onBaseBranchChange: (branchName: string) => void;
	onRenameBranch: (newName: string) => void;
	canRename: boolean;
}

export function ChangesHeader({
	currentBranch,
	defaultBranchName,
	baseBranch,
	onRenameBranch,
	canRename,
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
		<div className="group flex items-center gap-1.5 px-3 py-2 text-xs">
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
	);
}
