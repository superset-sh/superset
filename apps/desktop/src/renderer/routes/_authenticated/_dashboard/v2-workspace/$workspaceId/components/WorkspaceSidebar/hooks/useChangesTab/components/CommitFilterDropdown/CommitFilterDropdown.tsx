import type { AppRouter } from "@superset/host-service";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import type { inferRouterOutputs } from "@trpc/server";
import { Check, ChevronDown, ListFilter } from "lucide-react";
import { useState } from "react";
import type { ChangesFilter } from "../../useChangesTab";
import { CommitRow } from "./components/CommitRow";
import { RangeModal } from "./components/RangeModal";

type Commit =
	inferRouterOutputs<AppRouter>["git"]["listCommits"]["commits"][number];

function getFilterLabel(filter: ChangesFilter, commits: Commit[]): string {
	if (filter.kind === "all") return "All changes";
	if (filter.kind === "uncommitted") return "Uncommitted";
	if (filter.kind === "range") {
		const from = commits.find((c) => c.hash === filter.fromHash);
		const to = commits.find((c) => c.hash === filter.toHash);
		return `${from?.shortHash ?? filter.fromHash.slice(0, 7)}..${to?.shortHash ?? filter.toHash.slice(0, 7)}`;
	}
	const commit = commits.find((c) => c.hash === filter.hash);
	return commit?.shortHash ?? filter.hash.slice(0, 7);
}

interface CommitFilterDropdownProps {
	filter: ChangesFilter;
	onFilterChange: (filter: ChangesFilter) => void;
	commits: Commit[];
	uncommittedCount?: number;
}

export function CommitFilterDropdown({
	filter,
	onFilterChange,
	commits,
	uncommittedCount,
}: CommitFilterDropdownProps) {
	const [rangeModalOpen, setRangeModalOpen] = useState(false);

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
					>
						<span className="max-w-[140px] truncate">
							{getFilterLabel(filter, commits)}
						</span>
						<ChevronDown className="size-3" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-72">
					<DropdownMenuItem onSelect={() => onFilterChange({ kind: "all" })}>
						<div className="flex flex-1 items-center justify-between">
							<span>All changes</span>
							{filter.kind === "all" && <Check className="size-3.5" />}
						</div>
					</DropdownMenuItem>

					<DropdownMenuItem
						onSelect={() => onFilterChange({ kind: "uncommitted" })}
					>
						<div className="flex flex-1 items-center justify-between">
							<div>
								<div>Uncommitted changes</div>
								{uncommittedCount != null && (
									<div className="text-[10px] text-muted-foreground">
										{uncommittedCount} files changed
									</div>
								)}
							</div>
							{filter.kind === "uncommitted" && <Check className="size-3.5" />}
						</div>
					</DropdownMenuItem>

					{commits.length > 1 && (
						<DropdownMenuItem onSelect={() => setRangeModalOpen(true)}>
							<div className="flex flex-1 items-center justify-between">
								<div className="flex items-center gap-2">
									<ListFilter className="size-3.5 text-muted-foreground" />
									<span>Select range...</span>
								</div>
								{filter.kind === "range" && <Check className="size-3.5" />}
							</div>
						</DropdownMenuItem>
					)}

					{commits.length > 0 && (
						<>
							<DropdownMenuSeparator />
							{commits.map((commit) => (
								<DropdownMenuItem
									key={commit.hash}
									onSelect={() =>
										onFilterChange({
											kind: "commit",
											hash: commit.hash,
										})
									}
								>
									<CommitRow
										commit={commit}
										isSelected={
											filter.kind === "commit" && filter.hash === commit.hash
										}
									/>
								</DropdownMenuItem>
							))}
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			<RangeModal
				open={rangeModalOpen}
				onOpenChange={setRangeModalOpen}
				commits={commits}
				onSelect={(fromHash, toHash) =>
					onFilterChange({ kind: "range", fromHash, toHash })
				}
			/>
		</>
	);
}
