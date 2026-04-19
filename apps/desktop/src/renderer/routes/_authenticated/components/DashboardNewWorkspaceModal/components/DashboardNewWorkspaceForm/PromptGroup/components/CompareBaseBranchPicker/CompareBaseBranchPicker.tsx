import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@superset/ui/tooltip";
import { useEffect, useRef, useState } from "react";
import { GoGitBranch } from "react-icons/go";
import { HiCheck, HiChevronUpDown } from "react-icons/hi2";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import type { BranchFilter, BranchRow } from "../../../hooks/useBranchContext";
import { FormPickerTrigger } from "../FormPickerTrigger";

interface CompareBaseBranchPickerProps {
	effectiveCompareBaseBranch: string | null;
	defaultBranch: string | null | undefined;
	isBranchesLoading: boolean;
	isBranchesError: boolean;
	branches: BranchRow[];
	branchSearch: string;
	onBranchSearchChange: (value: string) => void;
	branchFilter: BranchFilter;
	onBranchFilterChange: (filter: BranchFilter) => void;
	isFetchingNextPage: boolean;
	hasNextPage: boolean;
	onLoadMore: () => void;
	onSelectCompareBaseBranch: (
		branchName: string,
		source: "local" | "remote-tracking",
	) => void;
	onCheckoutBranch: (branchName: string) => void;
	onOpenExisting: (branchName: string) => void;
	onAdoptWorktree: (branchName: string) => void;
	// Authoritative (cloud-synced) answer to "does a workspace row exist for
	// this branch on this host?". Computed from the v2Workspaces collection
	// so it stays in sync with soft-deletes. Trumps any server-side
	// `hasWorkspace` snapshot, which can be stale after deletion.
	hasWorkspaceForBranch: (branchName: string) => boolean;
}

export function CompareBaseBranchPicker({
	effectiveCompareBaseBranch,
	defaultBranch,
	isBranchesLoading,
	isBranchesError,
	branches,
	branchSearch,
	onBranchSearchChange,
	branchFilter,
	onBranchFilterChange,
	isFetchingNextPage,
	hasNextPage,
	onLoadMore,
	onSelectCompareBaseBranch,
	onCheckoutBranch,
	onOpenExisting,
	onAdoptWorktree,
	hasWorkspaceForBranch,
}: CompareBaseBranchPickerProps) {
	const [open, setOpen] = useState(false);
	const sentinelRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!open || !hasNextPage || isFetchingNextPage) return;
		const el = sentinelRef.current;
		if (!el) return;
		// Guard against cascade: when isFetchingNextPage flips false → effect
		// re-runs → observer reattaches → if sentinel is still in the root
		// margin (e.g. tall viewport, small page), the callback fires again
		// immediately. Re-checking the latest fetch state avoids loading every
		// remaining page in one chain.
		let inFlight = false;
		const observer = new IntersectionObserver(
			(entries) => {
				if (inFlight) return;
				if (entries.some((e) => e.isIntersecting)) {
					inFlight = true;
					onLoadMore();
				}
			},
			{ rootMargin: "64px" },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [open, hasNextPage, isFetchingNextPage, onLoadMore]);

	if (isBranchesError) {
		return (
			<span className="text-xs text-destructive">Failed to load branches</span>
		);
	}

	return (
		<Popover
			open={open}
			onOpenChange={(v) => {
				setOpen(v);
				if (!v) onBranchSearchChange("");
			}}
		>
			<PopoverTrigger asChild>
				<FormPickerTrigger
					disabled={isBranchesLoading && branches.length === 0}
					className="max-w-full"
				>
					<GoGitBranch className="size-3 shrink-0" />
					{isBranchesLoading && branches.length === 0 ? (
						<span className="h-2.5 w-14 rounded-sm bg-muted-foreground/15 animate-pulse" />
					) : (
						<span className="font-mono truncate">
							{effectiveCompareBaseBranch || "..."}
						</span>
					)}
					<HiChevronUpDown className="size-3 shrink-0" />
				</FormPickerTrigger>
			</PopoverTrigger>
			<PopoverContent
				className="w-96 p-0"
				align="start"
				onWheel={(event) => event.stopPropagation()}
			>
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search branches..."
						value={branchSearch}
						onValueChange={onBranchSearchChange}
					/>
					<Tabs
						value={branchFilter}
						onValueChange={(v) => onBranchFilterChange(v as BranchFilter)}
						className="p-2"
					>
						<TabsList className="grid w-full grid-cols-2 h-7 bg-transparent">
							<TabsTrigger value="branch" className="text-[11px]">
								Branch
							</TabsTrigger>
							<TabsTrigger value="worktree" className="text-[11px]">
								Worktree
							</TabsTrigger>
						</TabsList>
					</Tabs>
					<TooltipProvider delayDuration={300}>
						<CommandList className="max-h-[400px]">
							{!isBranchesLoading && branches.length === 0 && (
								<CommandEmpty>No branches found</CommandEmpty>
							)}
							{branches.map((branch) => {
								const isRemoteOnly = branch.isRemote && !branch.isLocal;
								return (
									<CommandItem
										key={branch.name}
										value={branch.name}
										onSelect={() => {
											// Carry the row's locality through so the server doesn't
											// re-resolve and risk picking a stale cached remote ref.
											onSelectCompareBaseBranch(
												branch.name,
												branch.isLocal ? "local" : "remote-tracking",
											);
											setOpen(false);
										}}
										className="group h-11 flex items-center justify-between gap-3 px-3"
									>
										<span className="flex items-center gap-2.5 truncate flex-1 min-w-0">
											<GoGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
											<span className="truncate font-mono text-xs">
												{branch.name}
											</span>
											<span className="flex items-center gap-1.5 shrink-0">
												{branch.name === defaultBranch && (
													<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
														default
													</span>
												)}
												{isRemoteOnly && (
													<span className="text-[10px] text-muted-foreground/60 bg-muted/60 px-1.5 py-0.5 rounded">
														remote
													</span>
												)}
											</span>
										</span>
										<span className="flex items-center gap-2 shrink-0">
											{branch.lastCommitDate > 0 && (
												<span className="text-[11px] text-muted-foreground/70 group-hover:hidden">
													{formatRelativeTime(branch.lastCommitDate * 1000)}
												</span>
											)}
											{branchFilter === "worktree" ? (
												(() => {
													// Authoritative check against the cloud-synced
													// collection — a `server hasWorkspace:true` row
													// may be stale after a delete.
													const hasWorkspace = hasWorkspaceForBranch(
														branch.name,
													);
													return (
														<button
															type="button"
															className="hidden group-hover:inline-flex group-focus-within:inline-flex items-center rounded-sm bg-primary/10 hover:bg-primary/20 px-2 py-0.5 text-[11px] text-primary font-medium"
															onClick={(e) => {
																e.stopPropagation();
																if (hasWorkspace) {
																	onOpenExisting(branch.name);
																} else {
																	onAdoptWorktree(branch.name);
																}
															}}
														>
															{hasWorkspace ? "Open" : "Create"}
														</button>
													);
												})()
											) : branch.isCheckedOut ? (
												<Tooltip>
													<TooltipTrigger asChild>
														{/*
															Use aria-disabled, NOT the native `disabled` attribute.
															Native disabled buttons don't fire pointer events, so the
															Tooltip never sees hover/focus and never opens — defeating
															the purpose of explaining why the button is unavailable.
														*/}
														<button
															type="button"
															aria-disabled="true"
															className="hidden group-hover:inline-flex group-focus-within:inline-flex items-center rounded-sm bg-muted px-2 py-0.5 text-[11px] text-muted-foreground/70 cursor-not-allowed"
															onClick={(e) => e.stopPropagation()}
														>
															Check out
														</button>
													</TooltipTrigger>
													<TooltipContent side="left">
														Already checked out in another worktree
													</TooltipContent>
												</Tooltip>
											) : (
												<button
													type="button"
													className="hidden group-hover:inline-flex group-focus-within:inline-flex items-center rounded-sm bg-primary/10 hover:bg-primary/20 px-2 py-0.5 text-[11px] text-primary font-medium"
													onClick={(e) => {
														e.stopPropagation();
														onCheckoutBranch(branch.name);
													}}
												>
													Check out
												</button>
											)}
											{effectiveCompareBaseBranch === branch.name && (
												<HiCheck className="size-4 text-primary" />
											)}
										</span>
									</CommandItem>
								);
							})}
							{hasNextPage && (
								<div
									ref={sentinelRef}
									className="py-2 text-center text-[11px] text-muted-foreground/60"
								>
									{isFetchingNextPage ? "Loading more..." : ""}
								</div>
							)}
						</CommandList>
					</TooltipProvider>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
