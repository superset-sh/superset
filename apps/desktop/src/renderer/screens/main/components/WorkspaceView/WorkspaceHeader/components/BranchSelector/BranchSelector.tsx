import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { useMemo, useRef, useState } from "react";
import { GoGitBranch } from "react-icons/go";
import { HiChevronDown } from "react-icons/hi2";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import { trpc } from "renderer/lib/trpc";

const PAGE_SIZE = 10;

interface BranchSelectorProps {
	worktreePath: string;
	currentBranch: string;
}

export function BranchSelector({
	worktreePath,
	currentBranch,
}: BranchSelectorProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
	const listRef = useRef<HTMLDivElement>(null);

	const { data: branchData } = trpc.changes.getBranches.useQuery(
		{ worktreePath },
		{ enabled: !!worktreePath },
	);

	const switchBranch = trpc.changes.switchBranch.useMutation();
	const utils = trpc.useUtils();

	const localBranches = branchData?.local ?? [];
	const checkedOutBranches = new Set(branchData?.checkedOutBranches ?? []);

	// Sort: current branch first, then other checked out branches, then the rest
	const sortedBranches = useMemo(
		() => [
			...localBranches.filter((b) => b.branch === currentBranch),
			...localBranches.filter(
				(b) => checkedOutBranches.has(b.branch) && b.branch !== currentBranch,
			),
			...localBranches.filter(
				(b) => !checkedOutBranches.has(b.branch) && b.branch !== currentBranch,
			),
		],
		[localBranches, checkedOutBranches, currentBranch],
	);

	// Filter branches based on search
	const filteredBranches = useMemo(() => {
		if (!search) return sortedBranches;
		const searchLower = search.toLowerCase();
		return sortedBranches.filter((b) =>
			b.branch.toLowerCase().includes(searchLower),
		);
	}, [sortedBranches, search]);

	// Paginate
	const visibleBranches = filteredBranches.slice(0, visibleCount);
	const hasMore = filteredBranches.length > visibleCount;

	const handleBranchChange = async (branch: string) => {
		if (branch === currentBranch) return;
		setOpen(false);
		try {
			await switchBranch.mutateAsync({ worktreePath, branch });
			utils.workspaces.getActive.invalidate();
			utils.changes.getBranches.invalidate();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to switch branch",
			);
		}
	};

	const handleOpenChange = (isOpen: boolean) => {
		setOpen(isOpen);
		if (!isOpen) {
			setSearch("");
			setVisibleCount(PAGE_SIZE);
		}
	};

	const handleShowMore = () => {
		setVisibleCount((c) => c + PAGE_SIZE);
		requestAnimationFrame(() => {
			listRef.current?.scrollTo({
				top: listRef.current.scrollHeight,
				behavior: "smooth",
			});
		});
	};

	if (sortedBranches.length === 0) {
		return null;
	}

	return (
		<div className="flex items-center gap-1.5 shrink-0">
			<GoGitBranch className="w-3.5 h-3.5" />
			<Popover open={open} onOpenChange={handleOpenChange}>
				<PopoverTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						className="h-6 px-2 py-0 font-medium border-none bg-muted/50 hover:bg-muted gap-1 rounded-md"
					>
						{currentBranch}
						<HiChevronDown className="w-3 h-3 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-[320px] p-0" align="start" sideOffset={4}>
					<Command shouldFilter={false}>
						<CommandInput
							placeholder="Search branches..."
							value={search}
							onValueChange={setSearch}
						/>
						<CommandList ref={listRef} className="p-1">
							<CommandEmpty className="py-3">No branches found</CommandEmpty>
							{visibleBranches.map(({ branch, lastCommitDate }) => {
								const isCheckedOut = checkedOutBranches.has(branch);
								const isCurrent = branch === currentBranch;
								const timeLabel = isCurrent
									? "(current)"
									: lastCommitDate > 0
										? formatRelativeTime(lastCommitDate)
										: "";
								return (
									<CommandItem
										key={branch}
										value={branch}
										onSelect={() => handleBranchChange(branch)}
										disabled={isCheckedOut}
										className="flex items-center justify-between gap-2"
									>
										<span className="truncate flex-1">{branch}</span>
										<span className="shrink-0 tabular-nums">
											{isCheckedOut && !isCurrent
												? `(in use) ${timeLabel}`
												: timeLabel}
										</span>
									</CommandItem>
								);
							})}
						</CommandList>
						{hasMore && (
							<div className="border-t p-1">
								<Button
									variant="ghost"
									size="sm"
									className="w-full text-xs"
									onClick={handleShowMore}
								>
									Show more ({filteredBranches.length - visibleCount} remaining)
								</Button>
							</div>
						)}
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}
