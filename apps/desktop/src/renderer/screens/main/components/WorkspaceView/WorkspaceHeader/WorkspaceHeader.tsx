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
import { HiChevronDown, HiOutlineFolder } from "react-icons/hi2";
import { OpenInButton } from "renderer/components/OpenInButton";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import { trpc } from "renderer/lib/trpc";

const PAGE_SIZE = 10;

interface WorkspaceHeaderProps {
	worktreePath: string | undefined;
}

export function WorkspaceHeader({ worktreePath }: WorkspaceHeaderProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
	const listRef = useRef<HTMLDivElement>(null);

	const folderName = worktreePath
		? worktreePath.split("/").filter(Boolean).pop() || worktreePath
		: null;

	// Replace home directory with ~ for display
	const displayPath = worktreePath?.replace(/^\/Users\/[^/]+/, "~") ?? null;

	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const currentBranch = activeWorkspace?.worktree?.branch;

	const { data: branchData } = trpc.changes.getBranches.useQuery(
		{ worktreePath: worktreePath || "" },
		{ enabled: !!worktreePath },
	);

	const switchBranch = trpc.changes.switchBranch.useMutation();
	const utils = trpc.useUtils();

	// local branches are already sorted by lastCommitDate (most recent first) from backend
	const localBranches = branchData?.local ?? [];
	const checkedOutBranches = new Set(branchData?.checkedOutBranches ?? []);

	// Sort: current branch first, then other checked out branches, then the rest (already sorted by commit date)
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
		if (!worktreePath || branch === currentBranch) return;
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

	return (
		<div className="w-full text-sm flex items-center gap-3 bg-tertiary px-3 pt-1.5 pb-0.5">
			{/* Path display */}
			{worktreePath && (
				<Tooltip>
					<TooltipTrigger asChild>
						<div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
							<HiOutlineFolder className="w-3.5 h-3.5 shrink-0" />
							<span className="truncate">{displayPath}</span>
						</div>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{displayPath}
					</TooltipContent>
				</Tooltip>
			)}

			{/* Branch selector */}
			{currentBranch && sortedBranches.length > 0 && (
				<div className="flex items-center gap-1.5 shrink-0">
					<GoGitBranch className="w-3.5 h-3.5" />
					<Popover open={open} onOpenChange={handleOpenChange}>
						<PopoverTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="h-6 px-2 py-0  font-medium border-none bg-muted/50 hover:bg-muted gap-1 rounded-md"
							>
								{currentBranch}
								<HiChevronDown className="w-3 h-3 opacity-50" />
							</Button>
						</PopoverTrigger>
						<PopoverContent
							className="w-[320px] p-0"
							align="start"
							sideOffset={4}
						>
							<Command shouldFilter={false}>
								<CommandInput
									placeholder="Search branches..."
									value={search}
									onValueChange={setSearch}
								/>
								<CommandList ref={listRef} className="max-h-[250px]">
									<CommandEmpty className="py-3">
										No branches found
									</CommandEmpty>
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
											onClick={() => {
												setVisibleCount((c) => c + PAGE_SIZE);
												// Scroll to bottom after state update
												requestAnimationFrame(() => {
													listRef.current?.scrollTo({
														top: listRef.current.scrollHeight,
														behavior: "smooth",
													});
												});
											}}
										>
											Show more ({filteredBranches.length - visibleCount}{" "}
											remaining)
										</Button>
									</div>
								)}
							</Command>
						</PopoverContent>
					</Popover>
				</div>
			)}

			<div className="ml-auto">
				<OpenInButton
					path={worktreePath}
					label={folderName ?? undefined}
					showShortcuts
				/>
			</div>
		</div>
	);
}
