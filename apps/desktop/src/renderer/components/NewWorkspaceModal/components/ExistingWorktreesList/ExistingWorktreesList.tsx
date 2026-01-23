import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { formatDistanceToNow } from "date-fns";
import { useMemo, useState } from "react";
import { GoGitBranch, GoGitPullRequest } from "react-icons/go";
import { HiChevronUpDown } from "react-icons/hi2";
import { LuGitBranch, LuLoader } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import {
	useCreateWorkspace,
	useOpenWorktree,
} from "renderer/react-query/workspaces";

interface ExistingWorktreesListProps {
	projectId: string;
	onOpenSuccess: () => void;
}

export function ExistingWorktreesList({
	projectId,
	onOpenSuccess,
}: ExistingWorktreesListProps) {
	const { data: worktrees = [], isLoading: isWorktreesLoading } =
		electronTrpc.workspaces.getWorktreesByProject.useQuery({ projectId });
	const { data: branchData, isLoading: isBranchesLoading } =
		electronTrpc.projects.getBranches.useQuery({ projectId });
	const openWorktree = useOpenWorktree();
	const createWorkspace = useCreateWorkspace();
	const createFromPr = electronTrpc.workspaces.createFromPr.useMutation();

	const [branchOpen, setBranchOpen] = useState(false);
	const [branchSearch, setBranchSearch] = useState("");
	const [prUrl, setPrUrl] = useState("");

	const closedWorktrees = worktrees
		.filter((wt) => !wt.hasActiveWorkspace)
		.sort((a, b) => b.createdAt - a.createdAt);
	const openWorktrees = worktrees
		.filter((wt) => wt.hasActiveWorkspace)
		.sort((a, b) => b.createdAt - a.createdAt);

	// Filter out branches that already have worktrees
	const branchesWithoutWorktrees = useMemo(() => {
		if (!branchData?.branches) return [];
		const worktreeBranches = new Set(worktrees.map((wt) => wt.branch));
		return branchData.branches.filter(
			(branch) => !worktreeBranches.has(branch.name),
		);
	}, [branchData?.branches, worktrees]);

	// Filter branches based on search
	const filteredBranches = useMemo(() => {
		if (!branchSearch) return branchesWithoutWorktrees;
		const searchLower = branchSearch.toLowerCase();
		return branchesWithoutWorktrees.filter((b) =>
			b.name.toLowerCase().includes(searchLower),
		);
	}, [branchesWithoutWorktrees, branchSearch]);

	const handleOpenWorktree = async (worktreeId: string, branch: string) => {
		toast.promise(openWorktree.mutateAsync({ worktreeId }), {
			loading: "Opening workspace...",
			success: () => {
				onOpenSuccess();
				return `Opened ${branch}`;
			},
			error: (err) =>
				err instanceof Error ? err.message : "Failed to open workspace",
		});
	};

	const handleOpenAll = async () => {
		if (closedWorktrees.length === 0) return;

		const count = closedWorktrees.length;
		toast.promise(
			(async () => {
				for (const wt of closedWorktrees) {
					await openWorktree.mutateAsync({ worktreeId: wt.id });
				}
			})(),
			{
				loading: `Opening ${count} workspaces...`,
				success: () => {
					onOpenSuccess();
					return `Opened ${count} workspaces`;
				},
				error: (err) =>
					err instanceof Error ? err.message : "Failed to open workspaces",
			},
		);
	};

	const handleCreateFromBranch = async (branchName: string) => {
		try {
			const result = await createWorkspace.mutateAsync({
				projectId,
				branchName,
				useExistingBranch: true,
			});

			onOpenSuccess();

			if (result.isInitializing) {
				toast.success("Workspace created", {
					description: "Setting up in the background...",
				});
			} else {
				toast.success("Workspace created");
			}
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to create workspace",
			);
		}
	};

	const handleCreateFromPr = async () => {
		if (!prUrl.trim()) return;

		try {
			const result = await createFromPr.mutateAsync({
				projectId,
				prUrl: prUrl.trim(),
			});

			onOpenSuccess();
			setPrUrl("");

			if (result.wasExisting) {
				toast.success(`Reopened PR #${result.prNumber}`, {
					description: result.prTitle,
				});
			} else {
				toast.success(`Opened PR #${result.prNumber}`, {
					description: result.prTitle,
				});
			}
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to open PR",
			);
		}
	};

	const handlePrKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !createFromPr.isPending) {
			e.preventDefault();
			handleCreateFromPr();
		}
	};

	const isLoading = isWorktreesLoading || isBranchesLoading;
	const isPending =
		openWorktree.isPending ||
		createWorkspace.isPending ||
		createFromPr.isPending;

	if (isLoading) {
		return (
			<div className="py-6 text-center text-xs text-muted-foreground">
				Loading...
			</div>
		);
	}

	const hasWorktrees = closedWorktrees.length > 0 || openWorktrees.length > 0;
	const hasBranches = branchesWithoutWorktrees.length > 0;

	return (
		<div className="space-y-3 max-h-[350px] overflow-y-auto">
			{/* PR URL Section */}
			<div className="space-y-1.5">
				<div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider px-2">
					Pull Request
				</div>
				<div className="flex gap-2">
					<div className="relative flex-1">
						<GoGitPullRequest className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
						<Input
							className="h-8 text-sm pl-8 pr-3"
							placeholder="Paste PR URL..."
							value={prUrl}
							onChange={(e) => setPrUrl(e.target.value)}
							onKeyDown={handlePrKeyDown}
							disabled={createFromPr.isPending}
						/>
					</div>
					<Button
						variant="outline"
						size="sm"
						className="h-8 px-3"
						onClick={handleCreateFromPr}
						disabled={!prUrl.trim() || createFromPr.isPending}
					>
						{createFromPr.isPending ? (
							<LuLoader className="size-3.5 animate-spin" />
						) : (
							"Open"
						)}
					</Button>
				</div>
			</div>

			{/* Branches Section */}
			{hasBranches && (
				<div className="space-y-1.5">
					<div className="border-t border-border pt-2" />
					<div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider px-2">
						Branches
					</div>
					<Popover open={branchOpen} onOpenChange={setBranchOpen} modal={false}>
						<PopoverTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								className="w-full h-8 justify-between font-normal"
								disabled={isPending}
							>
								<span className="flex items-center gap-2 truncate">
									<GoGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
									<span className="truncate text-sm text-muted-foreground">
										Select branch...
									</span>
								</span>
								<HiChevronUpDown className="size-4 shrink-0 text-muted-foreground" />
							</Button>
						</PopoverTrigger>
						<PopoverContent
							className="w-[--radix-popover-trigger-width] p-0"
							align="start"
							onWheel={(e) => e.stopPropagation()}
						>
							<Command shouldFilter={false}>
								<CommandInput
									placeholder="Search branches..."
									value={branchSearch}
									onValueChange={setBranchSearch}
								/>
								<CommandList className="max-h-[200px]">
									<CommandEmpty>No branches found</CommandEmpty>
									{filteredBranches.map((branch) => (
										<CommandItem
											key={branch.name}
											value={branch.name}
											onSelect={() => {
												setBranchOpen(false);
												setBranchSearch("");
												handleCreateFromBranch(branch.name);
											}}
											className="flex items-center justify-between"
										>
											<span className="flex items-center gap-2 truncate">
												<GoGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
												<span className="truncate">{branch.name}</span>
												{branch.name === branchData?.defaultBranch && (
													<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
														default
													</span>
												)}
											</span>
											{branch.lastCommitDate > 0 && (
												<span className="text-xs text-muted-foreground shrink-0">
													{formatRelativeTime(branch.lastCommitDate)}
												</span>
											)}
										</CommandItem>
									))}
								</CommandList>
							</Command>
						</PopoverContent>
					</Popover>
				</div>
			)}

			{/* Worktrees Section */}
			{hasWorktrees && (
				<div className="space-y-1">
					<div className="border-t border-border pt-2" />
					<div className="flex items-center justify-between">
						<div className="text-[10px] text-muted-foreground/60 uppercase tracking-wider px-2">
							Worktrees
						</div>
						{closedWorktrees.length > 1 && (
							<Button
								variant="ghost"
								size="sm"
								className="h-5 px-2 text-[10px]"
								onClick={handleOpenAll}
								disabled={isPending}
							>
								Open All
							</Button>
						)}
					</div>

					{closedWorktrees.map((wt) => (
						<button
							key={wt.id}
							type="button"
							onClick={() => handleOpenWorktree(wt.id, wt.branch)}
							disabled={isPending}
							className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-accent transition-colors disabled:opacity-50"
						>
							<LuGitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
							<span className="flex-1 text-sm truncate font-mono">
								{wt.branch}
							</span>
							<span className="text-xs text-muted-foreground shrink-0">
								{formatDistanceToNow(wt.createdAt, { addSuffix: false })}
							</span>
						</button>
					))}

					{openWorktrees.length > 0 && (
						<div className="pt-1">
							<div className="text-[10px] text-muted-foreground/40 uppercase tracking-wider px-2 py-1">
								Already open
							</div>
							{openWorktrees.map((wt) => (
								<div
									key={wt.id}
									className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground/60"
								>
									<LuGitBranch className="h-3.5 w-3.5 shrink-0" />
									<span className="flex-1 text-sm truncate font-mono">
										{wt.branch}
									</span>
									<span className="text-[10px] shrink-0">open</span>
								</div>
							))}
						</div>
					)}
				</div>
			)}

			{/* Empty state when no worktrees or branches */}
			{!hasWorktrees && !hasBranches && (
				<div className="py-4 text-center text-xs text-muted-foreground">
					No existing worktrees or branches.
					<br />
					Paste a PR URL above or create a new branch.
				</div>
			)}
		</div>
	);
}
