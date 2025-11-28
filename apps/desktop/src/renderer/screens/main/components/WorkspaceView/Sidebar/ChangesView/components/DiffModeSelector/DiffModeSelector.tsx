import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import type { Commit } from "lib/trpc/routers/diff/types";
import { HiChevronDown } from "react-icons/hi2";
import type { CommitRange, DiffMode } from "renderer/stores/diff/types";

interface DiffModeSelectorProps {
	mode: DiffMode;
	onModeChange: (mode: DiffMode) => void;
	commitRange: CommitRange | null;
	onCommitRangeChange: (range: CommitRange) => void;
	commits: Commit[];
	isLoadingCommits: boolean;
	parentBranch: string | null;
}

export function DiffModeSelector({
	mode,
	onModeChange,
	commitRange,
	onCommitRangeChange,
	commits,
	isLoadingCommits,
	parentBranch,
}: DiffModeSelectorProps) {
	const handleSelectCommit = (commit: Commit) => {
		onModeChange("range");
		onCommitRangeChange({
			from: commit.sha,
			to: "HEAD",
		});
	};

	const handleSelectParentBranch = () => {
		if (!parentBranch) return;
		onModeChange("range");
		onCommitRangeChange({
			from: parentBranch,
			to: "HEAD",
		});
	};

	return (
		<div className="flex items-center gap-1">
			<Button
				variant="ghost"
				size="sm"
				onClick={() => onModeChange("unstaged")}
				className={`text-xs px-2 py-1 h-7 ${
					mode === "unstaged"
						? "bg-tertiary-active"
						: "hover:bg-accent hover:text-accent-foreground"
				}`}
			>
				Unstaged
			</Button>
			<Button
				variant="ghost"
				size="sm"
				onClick={() => onModeChange("all-changes")}
				className={`text-xs px-2 py-1 h-7 ${
					mode === "all-changes"
						? "bg-tertiary-active"
						: "hover:bg-accent hover:text-accent-foreground"
				}`}
			>
				All Changes
			</Button>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						className={`text-xs px-2 py-1 h-7 ${
							mode === "range"
								? "bg-tertiary-active"
								: "hover:bg-accent hover:text-accent-foreground"
						}`}
					>
						{mode === "range" && commitRange ? (
							<span className="truncate max-w-[80px]">
								{commitRange.from.slice(0, 7)}..
							</span>
						) : (
							"Range"
						)}
						<HiChevronDown className="size-3 ml-1" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-64">
					{parentBranch && (
						<>
							<DropdownMenuItem onClick={handleSelectParentBranch}>
								<div className="flex flex-col gap-0.5">
									<span className="font-medium">Compare to {parentBranch}</span>
									<span className="text-xs text-muted-foreground">
										All changes since branching
									</span>
								</div>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
						</>
					)}
					{isLoadingCommits ? (
						<DropdownMenuItem disabled>Loading commits...</DropdownMenuItem>
					) : commits.length === 0 ? (
						<DropdownMenuItem disabled>No commits found</DropdownMenuItem>
					) : (
						<>
							<div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
								Recent Commits
							</div>
							{commits.slice(0, 10).map((commit) => (
								<DropdownMenuItem
									key={commit.sha}
									onClick={() => handleSelectCommit(commit)}
								>
									<div className="flex flex-col gap-0.5 min-w-0">
										<div className="flex items-center gap-2">
											<span className="font-mono text-xs text-muted-foreground shrink-0">
												{commit.shortSha}
											</span>
											<span className="truncate">{commit.message}</span>
										</div>
									</div>
								</DropdownMenuItem>
							))}
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
