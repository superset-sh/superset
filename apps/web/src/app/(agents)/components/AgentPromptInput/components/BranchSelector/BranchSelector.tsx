"use client";

import { ChevronDown, GitBranch } from "lucide-react";
import { mockBranches } from "../../../../mock-data";
import { ResponsiveDropdown } from "../../../ResponsiveDropdown";

type BranchSelectorProps = {
	selectedBranch: string;
	onBranchChange: (branch: string) => void;
};

export function BranchSelector({
	selectedBranch,
	onBranchChange,
}: BranchSelectorProps) {
	return (
		<ResponsiveDropdown
			title="Select branch"
			items={mockBranches.map((branch) => ({
				label: branch,
				icon: <GitBranch className="size-3" />,
				onSelect: () => onBranchChange(branch),
			}))}
			trigger={
				<button
					type="button"
					className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					<GitBranch className="size-3" />
					<span>{selectedBranch}</span>
					<ChevronDown className="size-3" />
				</button>
			}
		/>
	);
}
