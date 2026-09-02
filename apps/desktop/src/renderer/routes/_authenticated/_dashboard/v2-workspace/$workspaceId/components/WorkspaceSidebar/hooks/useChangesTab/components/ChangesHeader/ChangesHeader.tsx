import { Trans } from "@lingui/react/macro";
import { GitBranch, Pencil } from "lucide-react";
import { useState } from "react";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
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

	const startEditing = () => {
		setEditValue(currentBranch.name);
		setIsEditing(true);
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
				<RenameInput
					value={editValue}
					onChange={setEditValue}
					onSubmit={handleSubmit}
					onCancel={() => setIsEditing(false)}
					className="-ml-1 min-w-0 flex-1 border-none bg-transparent px-1 py-0 font-medium outline-none"
				/>
			) : (
				<>
					{canRename ? (
						<button
							type="button"
							onClick={startEditing}
							title={currentBranch.name}
							className="flex min-w-0 items-center gap-1.5 text-left"
						>
							<span className="min-w-0 truncate font-medium">
								{currentBranch.name}
							</span>
							<Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
						</button>
					) : (
						<span
							className="min-w-0 truncate font-medium"
							title={currentBranch.name}
						>
							{currentBranch.name}
						</span>
					)}
					{/* Selector as a placeholder in the message: a bare "from"
					    cannot precede the branch in every language — Korean puts
					    the postposition after it. */}
					<Trans id="workspace.changesHeader.fromBase">
						<span className="shrink-0 text-muted-foreground/60">from</span>{" "}
						<BaseBranchSelector
							branches={branches}
							currentValue={baseBranch ?? defaultBranchName}
							onChange={onBaseBranchChange}
						/>
					</Trans>
				</>
			)}
		</div>
	);
}
