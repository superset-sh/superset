import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { ExternalLinkIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { GoArrowUpRight, GoGitBranch, GoGlobe } from "react-icons/go";
import { HiCheck, HiChevronUpDown } from "react-icons/hi2";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import type { OpenableWorktreeAction } from "../../utils/resolveOpenableWorktrees";

interface CompareBaseBranchPickerInlineProps {
	effectiveCompareBaseBranch: string | null;
	defaultBranch?: string;
	isBranchesLoading: boolean;
	isBranchesError: boolean;
	branches: Array<{ name: string; lastCommitDate: number; isLocal: boolean }>;
	worktreeBranches: Set<string>;
	openableWorktrees: Map<string, OpenableWorktreeAction>;
	activeWorkspacesByBranch: Map<string, string>;
	externalWorktreeBranches: Set<string>;
	modKey: string;
	onSelectCompareBaseBranch: (branchName: string) => void;
	onOpenWorktree: (action: OpenableWorktreeAction) => void;
	onOpenActiveWorkspace: (workspaceId: string) => void;
}

export function CompareBaseBranchPickerInline({
	effectiveCompareBaseBranch,
	defaultBranch,
	isBranchesLoading,
	isBranchesError,
	branches,
	worktreeBranches,
	openableWorktrees,
	activeWorkspacesByBranch,
	externalWorktreeBranches,
	modKey,
	onSelectCompareBaseBranch,
	onOpenWorktree,
	onOpenActiveWorkspace,
}: CompareBaseBranchPickerInlineProps) {
	const [open, setOpen] = useState(false);
	const [branchSearch, setBranchSearch] = useState("");
	const [filterMode, setFilterMode] = useState<"all" | "worktrees">("all");

	const filteredBranches = useMemo(() => {
		if (!branches.length) return [];
		if (!branchSearch) return branches;
		const searchLower = branchSearch.toLowerCase();
		return branches.filter((branch) =>
			branch.name.toLowerCase().includes(searchLower),
		);
	}, [branches, branchSearch]);

	const displayBranches = useMemo(() => {
		if (filterMode === "all") return filteredBranches;
		return filteredBranches.filter((b) => worktreeBranches.has(b.name));
	}, [filteredBranches, filterMode, worktreeBranches]);

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
				if (!v) {
					setBranchSearch("");
					setFilterMode("all");
				}
			}}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					disabled={isBranchesLoading}
					className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 min-w-0 max-w-full"
				>
					<GoGitBranch className="size-3 shrink-0" />
					{isBranchesLoading ? (
						<span className="h-2.5 w-14 rounded-sm bg-muted-foreground/15 animate-pulse" />
					) : (
						<span className="font-mono truncate">
							{effectiveCompareBaseBranch || "..."}
						</span>
					)}
					<HiChevronUpDown className="size-3 shrink-0" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				className="w-96 p-0"
				align="start"
				onWheel={(event) => event.stopPropagation()}
			>
				<Command shouldFilter={false}>
					<div className="flex items-center gap-0.5 rounded-md bg-muted/40 p-0.5 mx-2 mt-2">
						{(["all", "worktrees"] as const).map((value) => {
							const count =
								value === "all"
									? branches.length
									: branches.filter((b) => worktreeBranches.has(b.name)).length;
							return (
								<button
									key={value}
									type="button"
									onClick={() => setFilterMode(value)}
									className={cn(
										"flex-1 rounded px-2 py-1 text-xs text-center transition-colors",
										filterMode === value
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									{value === "all" ? "All" : "Worktrees"}
									<span className="ml-1 text-foreground/40">{count}</span>
								</button>
							);
						})}
					</div>
					<CommandInput
						placeholder="Search branches..."
						value={branchSearch}
						onValueChange={setBranchSearch}
					/>
					<CommandList className="max-h-[400px]">
						<CommandEmpty>No branches found</CommandEmpty>
						{displayBranches.map((branch) => {
							const openAction = openableWorktrees.get(branch.name);
							const activeWorkspaceId = activeWorkspacesByBranch.get(
								branch.name,
							);
							const isExternal = externalWorktreeBranches.has(branch.name);
							const hasExistingWorkspace = !!(activeWorkspaceId || openAction);

							// Determine icon based on state - all same color
							let icon: React.ReactNode;
							if (activeWorkspaceId) {
								icon = (
									<GoArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
								);
							} else if (openAction) {
								icon = (
									<ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
								);
							} else if (branch.isLocal) {
								icon = (
									<GoGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
								);
							} else {
								icon = (
									<GoGlobe className="size-3.5 shrink-0 text-muted-foreground" />
								);
							}

							return (
								<CommandItem
									key={branch.name}
									value={branch.name}
									onSelect={() => {
										if (activeWorkspaceId) {
											onOpenActiveWorkspace(activeWorkspaceId);
										} else if (openAction) {
											onOpenWorktree(openAction);
										} else {
											onSelectCompareBaseBranch(branch.name);
										}
										setOpen(false);
									}}
									className="group h-11 flex items-center justify-between gap-3 px-3"
								>
									<span className="flex items-center gap-2.5 truncate flex-1 min-w-0">
										{icon}
										<span className="truncate font-mono text-xs">
											{branch.name}
										</span>

										{/* Inline badges */}
										<span className="flex items-center gap-1.5 shrink-0">
											{branch.name === defaultBranch && (
												<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
													default
												</span>
											)}
											{isExternal && !activeWorkspaceId && (
												<span className="text-[10px] text-muted-foreground/60 bg-muted/60 px-1.5 py-0.5 rounded">
													external
												</span>
											)}
										</span>
									</span>

									{/* Right side: time + buttons */}
									<span className="flex items-center gap-2 shrink-0">
										{branch.lastCommitDate > 0 && (
											<span className="text-[11px] text-muted-foreground/70 group-data-[selected=true]:hidden">
												{formatRelativeTime(branch.lastCommitDate)}
											</span>
										)}

										{/* Show checkmark for selected base branch when not hovering */}
										{!hasExistingWorkspace &&
											effectiveCompareBaseBranch === branch.name && (
												<HiCheck className="size-4 text-primary group-data-[selected=true]:hidden" />
											)}

										{/* Action buttons - show on hover/select */}
										<span className="hidden group-data-[selected=true]:flex items-center gap-1.5">
											{hasExistingWorkspace && (
												<Button
													size="sm"
													variant="ghost"
													className="h-7 px-2.5 text-xs font-medium hover:bg-accent/10 hover:text-accent-foreground"
													onClick={(e) => {
														e.stopPropagation();
														if (activeWorkspaceId) {
															onOpenActiveWorkspace(activeWorkspaceId);
														} else if (openAction) {
															onOpenWorktree(openAction);
														}
														setOpen(false);
													}}
												>
													<GoArrowUpRight className="size-3.5 mr-1" />
													Open
													<span className="ml-1 text-[10px] opacity-60">↵</span>
												</Button>
											)}
											<Button
												size="sm"
												className="h-7 px-2.5 text-xs font-medium"
												onClick={(e) => {
													e.stopPropagation();
													onSelectCompareBaseBranch(branch.name);
													setOpen(false);
												}}
											>
												{hasExistingWorkspace ? (
													<>
														<PlusIcon className="size-3.5 mr-1" />
														Create
														<span className="ml-1 text-[10px] opacity-70">
															{modKey}↵
														</span>
													</>
												) : (
													<>
														Create
														<span className="ml-1 text-[10px] opacity-70">
															↵
														</span>
													</>
												)}
											</Button>
										</span>
									</span>
								</CommandItem>
							);
						})}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
