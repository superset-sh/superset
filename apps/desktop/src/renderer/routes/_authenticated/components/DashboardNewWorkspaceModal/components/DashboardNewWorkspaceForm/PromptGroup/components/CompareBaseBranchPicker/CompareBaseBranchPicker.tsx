import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { useEffect, useRef, useState } from "react";
import { GoGitBranch, GoGlobe } from "react-icons/go";
import { HiCheck, HiChevronUpDown } from "react-icons/hi2";
import { LuFolderOpen } from "react-icons/lu";
import { PLATFORM } from "renderer/hotkeys";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import type { BranchFilter, BranchRow } from "../../../hooks/useBranchContext";
import { FormPickerTrigger } from "../FormPickerTrigger";
import {
	type OpenWorkspaceTarget,
	toOpenWorkspaceTarget,
} from "./openWorkspaceTarget";

const MOD_KEY = PLATFORM === "mac" ? "⌘" : "Ctrl";

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
	// Server's workspaces.create resolves between open-tracked, adopt-foreign-
	// worktree, and fresh-create. Worktree rows must carry their path so stale
	// branch labels do not make the server create a new managed worktree.
	onOpenWorkspace: (target: OpenWorkspaceTarget) => void;
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
	onOpenWorkspace,
}: CompareBaseBranchPickerProps) {
	const [open, setOpen] = useState(false);
	// Mirror cmdk's selected row so Mod+Enter can resolve it without DOM lookup.
	const [selectedValue, setSelectedValue] = useState("");
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
					) : effectiveCompareBaseBranch ? (
						<span className="font-mono truncate">
							{effectiveCompareBaseBranch}
						</span>
					) : (
						<span className="truncate text-muted-foreground/80">
							Select base branch…
						</span>
					)}
					<HiChevronUpDown className="size-3 shrink-0" />
				</FormPickerTrigger>
			</PopoverTrigger>
			<PopoverContent
				className="w-[440px] p-0"
				align="start"
				onWheel={(event) => event.stopPropagation()}
			>
				<Command
					shouldFilter={false}
					value={selectedValue}
					onValueChange={setSelectedValue}
					onKeyDown={(e) => {
						// cmdk leaves focus on the input, so the per-row button is
						// pointer-only — Mod+Enter is the keyboard path to it.
						if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
							const selectedBranch = branches.find(
								(branch) => branch.name === selectedValue,
							);
							if (!selectedBranch) return;
							e.preventDefault();
							e.stopPropagation();
							onOpenWorkspace(toOpenWorkspaceTarget(selectedBranch));
							setOpen(false);
						}
					}}
				>
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
							<TabsTrigger value="all" className="text-[11px]">
								All
							</TabsTrigger>
							<TabsTrigger value="worktree" className="text-[11px]">
								Worktree
							</TabsTrigger>
						</TabsList>
					</Tabs>
					<CommandList className="max-h-[420px]">
						{!isBranchesLoading && branches.length === 0 && (
							<CommandEmpty>No branches found</CommandEmpty>
						)}
						{branches.map((branch) => {
							const isRemoteOnly = branch.isRemote && !branch.isLocal;
							const isWorktree = Boolean(branch.worktreePath);
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
									className="group items-start gap-3 rounded-md px-2.5 py-2"
								>
									{isWorktree ? (
										<LuFolderOpen className="mt-0.5 size-4 shrink-0 text-primary/80" />
									) : isRemoteOnly ? (
										<GoGlobe className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />
									) : (
										<GoGitBranch className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
									)}
									<div className="flex min-w-0 flex-1 flex-col gap-0.5">
										<span className="truncate text-sm leading-snug">
											{branch.name}
										</span>
										<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
											{branch.lastCommitDate > 0 && (
												<span>
													{formatRelativeTime(branch.lastCommitDate * 1000)}
												</span>
											)}
											{branch.name === defaultBranch && (
												<>
													<span aria-hidden>·</span>
													<span>default</span>
												</>
											)}
											{isRemoteOnly && (
												<>
													<span aria-hidden>·</span>
													<span>remote</span>
												</>
											)}
											{isWorktree && (
												<>
													<span aria-hidden>·</span>
													<span className="text-primary/80">worktree</span>
												</>
											)}
										</span>
									</div>
									<span className="ml-2 flex shrink-0 items-center gap-1.5 self-center">
										<button
											type="button"
											className="hidden items-center rounded-sm bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20 group-hover:inline-flex group-data-[selected=true]:inline-flex"
											onClick={(e) => {
												e.stopPropagation();
												onOpenWorkspace(toOpenWorkspaceTarget(branch));
												setOpen(false);
											}}
										>
											Open workspace
											<span className="ml-1.5 text-[10px] opacity-70">
												{MOD_KEY}↵
											</span>
										</button>
										{effectiveCompareBaseBranch === branch.name && (
											<HiCheck className="size-4 text-primary group-hover:hidden group-data-[selected=true]:hidden" />
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
				</Command>
			</PopoverContent>
		</Popover>
	);
}
