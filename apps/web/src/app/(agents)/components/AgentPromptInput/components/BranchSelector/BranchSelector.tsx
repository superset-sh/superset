"use client";

import { ChevronDown, GitBranch } from "lucide-react";
import { ResponsiveDropdown } from "../../../ResponsiveDropdown";

type BranchSelectorProps = {
	branches: string[];
	selectedBranch: string;
	onBranchChange: (branch: string) => void;
	disabled?: boolean;
};

export function BranchSelector({
	branches,
	selectedBranch,
	onBranchChange,
	disabled = false,
}: BranchSelectorProps) {
	return (
		<ResponsiveDropdown
			title="Select branch"
			items={branches.map((branch) => ({
				label: branch,
				icon: <GitBranch className="size-3" />,
				onSelect: () => onBranchChange(branch),
			}))}
			trigger={
				<button
					type="button"
					disabled={disabled}
					className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
				>
					<GitBranch className="size-3" />
					<span>{selectedBranch}</span>
					<ChevronDown className="size-3" />
				</button>
			}
		/>
	);
}
