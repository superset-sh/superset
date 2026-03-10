import type { GitHubStatus } from "@superset/local-db";
import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	VscCheck,
	VscGitStash,
	VscGitStashApply,
	VscRefresh,
	VscSourceControl,
} from "react-icons/vsc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { ChangesViewMode } from "../../types";
import { ViewModeToggle } from "../ViewModeToggle";
import { PRButton } from "./components/PRButton";

const BRANCH_QUERY_STALE_TIME_MS = 10_000;

interface ChangesHeaderProps {
	onRefresh: () => void;
	viewMode: ChangesViewMode;
	onViewModeChange: (mode: ChangesViewMode) => void;
	worktreePath: string;
	pr: GitHubStatus["pr"] | null;
	isPRStatusLoading: boolean;
	canCreatePR: boolean;
	createPRBlockedReason: string | null;
	onStash: () => void;
	onStashIncludeUntracked: () => void;
	onStashPop: () => void;
	isStashPending: boolean;
}

function BaseBranchSelector({ worktreePath }: { worktreePath: string }) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const utils = electronTrpc.useUtils();
	const { data: branchData, isLoading } =
		electronTrpc.changes.getBranches.useQuery(
			{ worktreePath },
			{
				enabled: !!worktreePath,
				staleTime: BRANCH_QUERY_STALE_TIME_MS,
				refetchOnWindowFocus: false,
			},
		);

	const updateBaseBranch = electronTrpc.changes.updateBaseBranch.useMutation({
		onSuccess: () => {
			utils.changes.getBranches.invalidate({ worktreePath });
		},
	});

	const effectiveBaseBranch =
		branchData?.worktreeBaseBranch ?? branchData?.defaultBranch ?? "main";
	const sortedBranches = useMemo(() => {
		return [...(branchData?.remote ?? [])].sort((a, b) => {
			if (a === effectiveBaseBranch) return -1;
			if (b === effectiveBaseBranch) return 1;
			if (a === branchData?.defaultBranch) return -1;
			if (b === branchData?.defaultBranch) return 1;
			return a.localeCompare(b);
		});
	}, [branchData?.remote, branchData?.defaultBranch, effectiveBaseBranch]);

	const filteredBranches = useMemo(() => {
		if (!search) return sortedBranches.filter(Boolean);
		const lower = search.toLowerCase();
		return sortedBranches.filter((branch) =>
			branch?.toLowerCase().includes(lower),
		);
	}, [sortedBranches, search]);

	const handleBranchSelect = (branch: string) => {
		updateBaseBranch.mutate({
			worktreePath,
			baseBranch: branch === branchData?.defaultBranch ? null : branch,
		});
		setOpen(false);
		setSearch("");
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-6 p-0"
							disabled={isLoading}
						>
							<VscSourceControl className="size-3.5" />
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="top" showArrow={false}>
					Change base branch
				</TooltipContent>
			</Tooltip>
			<PopoverContent align="start" className="w-56 p-0">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search branches..."
						value={search}
						onValueChange={setSearch}
					/>
					<CommandList className="max-h-[200px]">
						<CommandEmpty>No branches found</CommandEmpty>
						{filteredBranches.map((branch) => (
							<CommandItem
								key={branch}
								value={branch}
								onSelect={() => handleBranchSelect(branch)}
								className="flex items-center justify-between text-xs"
							>
								<span className="truncate">
									{branch}
									{branch === branchData?.defaultBranch && (
										<span className="ml-1 text-muted-foreground">
											(default)
										</span>
									)}
								</span>
								{branch === effectiveBaseBranch && (
									<VscCheck className="size-3.5 shrink-0 text-primary" />
								)}
							</CommandItem>
						))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function StashDropdown({
	onStash,
	onStashIncludeUntracked,
	onStashPop,
	isPending,
}: {
	onStash: () => void;
	onStashIncludeUntracked: () => void;
	onStashPop: () => void;
	isPending: boolean;
}) {
	return (
		<DropdownMenu>
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-6 p-0"
							disabled={isPending}
						>
							<VscGitStash className="size-4" />
						</Button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="top" showArrow={false}>
					Stash operations
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="start" className="w-52">
				<DropdownMenuItem onClick={onStash} className="text-xs">
					<VscGitStash className="size-4" />
					Stash Changes
				</DropdownMenuItem>
				<DropdownMenuItem onClick={onStashIncludeUntracked} className="text-xs">
					<VscGitStash className="size-4" />
					Stash (Include Untracked)
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={onStashPop} className="text-xs">
					<VscGitStashApply className="size-4" />
					Pop Stash
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function RefreshButton({ onRefresh }: { onRefresh: () => void }) {
	const [isSpinning, setIsSpinning] = useState(false);
	const timeoutRef = useRef<NodeJS.Timeout | null>(null);

	const handleClick = () => {
		setIsSpinning(true);
		onRefresh();
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		timeoutRef.current = setTimeout(() => setIsSpinning(false), 600);
	};

	useEffect(() => {
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, []);

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={handleClick}
					disabled={isSpinning}
					className="size-6 p-0"
				>
					<VscRefresh
						className={`size-3.5 ${isSpinning ? "animate-spin" : ""}`}
					/>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="top" showArrow={false}>
				Refresh changes
			</TooltipContent>
		</Tooltip>
	);
}

const reviewTagStyles = {
	approved:
		"border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	changes_requested:
		"border border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300",
	pending:
		"border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
} as const;

const reviewTagLabels = {
	approved: "Approved",
	changes_requested: "Changes req.",
	pending: "Review pending",
} as const;

function ReviewTag({
	status,
	requestedReviewers,
}: {
	status: "approved" | "changes_requested" | "pending";
	requestedReviewers?: string[];
}) {
	const label =
		status === "pending" && requestedReviewers && requestedReviewers.length > 0
			? `Awaiting ${requestedReviewers.join(", ")}`
			: reviewTagLabels[status];

	return (
		<span
			className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0 truncate max-w-[140px] ${reviewTagStyles[status]}`}
			title={label}
		>
			{label}
		</span>
	);
}

export function ChangesHeader({
	onRefresh,
	viewMode,
	onViewModeChange,
	worktreePath,
	pr,
	isPRStatusLoading,
	canCreatePR,
	createPRBlockedReason,
	onStash,
	onStashIncludeUntracked,
	onStashPop,
	isStashPending,
}: ChangesHeaderProps) {
	return (
		<div className="flex items-center gap-0.5 px-2 py-1.5">
			<BaseBranchSelector worktreePath={worktreePath} />
			<StashDropdown
				onStash={onStash}
				onStashIncludeUntracked={onStashIncludeUntracked}
				onStashPop={onStashPop}
				isPending={isStashPending}
			/>
			<ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
			<RefreshButton onRefresh={onRefresh} />
			{pr && pr.state === "open" && (
				<ReviewTag
					status={pr.reviewDecision}
					requestedReviewers={pr.requestedReviewers}
				/>
			)}
			<PRButton
				pr={pr}
				isLoading={isPRStatusLoading}
				canCreatePR={canCreatePR}
				createPRBlockedReason={createPRBlockedReason}
				worktreePath={worktreePath}
				onRefresh={onRefresh}
			/>
		</div>
	);
}
