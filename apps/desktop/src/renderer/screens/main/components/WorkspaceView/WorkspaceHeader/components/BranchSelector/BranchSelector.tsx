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
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useMemo, useRef, useState } from "react";
import { GoGitBranch } from "react-icons/go";
import { HiChevronDown, HiOutlineArrowTopRightOnSquare } from "react-icons/hi2";
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
	const checkedOutBranches = branchData?.checkedOutBranches ?? {};

	const openInApp = trpc.external.openInApp.useMutation();
	const { data: lastUsedApp = "cursor" } =
		trpc.settings.getLastUsedApp.useQuery();

	const handleOpenWorktree = (e: React.MouseEvent, worktreePath: string) => {
		e.stopPropagation();
		openInApp.mutate({ path: worktreePath, app: lastUsedApp });
	};

	const sortedBranches = useMemo(
		() => [
			...localBranches.filter((b) => b.branch === currentBranch),
			...localBranches.filter(
				(b) => b.branch in checkedOutBranches && b.branch !== currentBranch,
			),
			...localBranches.filter(
				(b) => !(b.branch in checkedOutBranches) && b.branch !== currentBranch,
			),
		],
		[localBranches, checkedOutBranches, currentBranch],
	);

	const filteredBranches = useMemo(() => {
		if (!search) return sortedBranches;
		const searchLower = search.toLowerCase();
		return sortedBranches.filter((b) =>
			b.branch.toLowerCase().includes(searchLower),
		);
	}, [sortedBranches, search]);

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
		<Popover open={open} onOpenChange={handleOpenChange}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button variant="outline" size="sm" className="gap-1">
							<GoGitBranch className="size-4" />
							<span>{currentBranch}</span>
							<HiChevronDown className="size-3" />
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					Switch to a different branch
				</TooltipContent>
			</Tooltip>
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
							const worktreePath = checkedOutBranches[branch];
							const isCheckedOut = !!worktreePath;
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
									<div className="flex items-center gap-2 shrink-0">
										{isCheckedOut && !isCurrent && (
											<Tooltip>
												<TooltipTrigger asChild>
													<button
														type="button"
														onClick={(e) => handleOpenWorktree(e, worktreePath)}
														className="p-0.5 hover:bg-accent rounded"
													>
														<HiOutlineArrowTopRightOnSquare className="size-3.5" />
													</button>
												</TooltipTrigger>
												<TooltipContent side="top" showArrow={false}>
													Open worktree
												</TooltipContent>
											</Tooltip>
										)}
										<span className="tabular-nums">
											{isCheckedOut && !isCurrent
												? `(in use) ${timeLabel}`
												: timeLabel}
										</span>
									</div>
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
	);
}
