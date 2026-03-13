import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	LuChevronDown,
	LuChevronRight,
	LuGitBranch,
} from "react-icons/lu";

interface GitStatusSectionProps {
	data:
		| {
				branch: string | null;
				ahead: number;
				behind: number;
				staged: number;
				modified: number;
				untracked: number;
				stashes: number;
				hasConflicts: boolean;
				lastCommitMessage: string | null;
				lastCommitDate: string | null;
		  }
		| undefined;
	isLoading: boolean;
}

export function GitStatusSection({ data, isLoading }: GitStatusSectionProps) {
	const [collapsed, setCollapsed] = useState(false);

	return (
		<div className="overflow-hidden border-t border-border">
			<button
				type="button"
				onClick={() => setCollapsed(!collapsed)}
				className={cn(
					"flex w-full items-center gap-1.5 px-3 py-2",
					"text-xs font-medium uppercase tracking-wider text-muted-foreground",
					"hover:bg-accent/30 cursor-pointer transition-colors",
				)}
			>
				{collapsed ? (
					<LuChevronRight className="size-3 shrink-0" />
				) : (
					<LuChevronDown className="size-3 shrink-0" />
				)}
				<LuGitBranch className="size-3 shrink-0" />
				<span>Git Status</span>
				{data?.branch && (
					<span className="ml-auto text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded-full truncate max-w-[120px]">
						{data.branch}
					</span>
				)}
			</button>

			{!collapsed && (
				<div className="px-3 py-2 text-sm">
					{isLoading ? (
						<p className="text-muted-foreground">Loading...</p>
					) : !data ? (
						<p className="text-muted-foreground">No git data</p>
					) : (
						<div className="space-y-1">
							{data.hasConflicts && (
								<div className="text-destructive text-xs font-medium">
									Merge conflicts detected
								</div>
							)}
							<div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
								{data.staged > 0 && (
									<span className="text-green-500">
										+{data.staged} staged
									</span>
								)}
								{data.modified > 0 && (
									<span className="text-yellow-500">
										~{data.modified} modified
									</span>
								)}
								{data.untracked > 0 && (
									<span className="text-muted-foreground">
										{data.untracked} untracked
									</span>
								)}
								{data.ahead > 0 && <span>{data.ahead} ahead</span>}
								{data.behind > 0 && <span>{data.behind} behind</span>}
								{data.stashes > 0 && <span>{data.stashes} stashed</span>}
							</div>
							{data.lastCommitMessage && (
								<p className="text-xs text-muted-foreground/70 truncate">
									{data.lastCommitMessage}
								</p>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
