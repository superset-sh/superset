import { Button } from "@superset/ui/button";
import { CommandEmpty, CommandGroup, CommandItem } from "@superset/ui/command";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GoArrowUpRight, GoGitBranch, GoGlobe } from "react-icons/go";

import { electronTrpc } from "renderer/lib/electron-trpc";
import { useImportAllWorktrees } from "renderer/react-query/workspaces";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useHotkeysStore } from "renderer/stores/hotkeys/store";
import { useNewWorkspaceModalDraft } from "../../NewWorkspaceModalDraftContext";
import { buildCreateWorkspaceFromBranchInput } from "./buildCreateWorkspaceFromBranchInput";
import { resolveBranchAction } from "./resolveBranchAction";

interface BranchesGroupProps {
	projectId: string | null;
}

const PAGE_SIZE = 50;

type BranchFilterMode = "all" | "worktrees";

/** Displays a searchable, infinitely-scrollable list of git branches for creating or opening workspaces. */
export function BranchesGroup({ projectId }: BranchesGroupProps) {
	const platform = useHotkeysStore((state) => state.platform);
	const modKey = platform === "darwin" ? "⌘" : "Ctrl";
	const navigate = useNavigate();
	const importAllWorktrees = useImportAllWorktrees();
	const {
		createWorkspace,
		openTrackedWorktree,
		openExternalWorktree,
		draft,
		closeAndResetDraft,
		runAsyncAction,
	} = useNewWorkspaceModalDraft();
	const [filterMode, setFilterMode] = useState<BranchFilterMode>("all");
	const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);

	// Reset pagination when search query changes
	const [prevQuery, setPrevQuery] = useState(draft.branchesQuery);
	if (prevQuery !== draft.branchesQuery) {
		setPrevQuery(draft.branchesQuery);
		setDisplayLimit(PAGE_SIZE);
	}

	const {
		data: searchData,
		isLoading: isSearchLoading,
		isError: isSearchError,
	} = electronTrpc.projects.searchBranches.useQuery(
		{
			projectId: projectId ?? "",
			search: "",
			limit: 5000,
			offset: 0,
		},
		{
			enabled: !!projectId && filterMode === "all",
			placeholderData: (previous) => previous,
			retry: false,
		},
	);

	// Fallback: use getBranchesLocal when searchBranches fails
	const { data: localBranchData, isLoading: isLocalLoading } =
		electronTrpc.projects.getBranchesLocal.useQuery(
			{ projectId: projectId ?? "" },
			{ enabled: !!projectId && isSearchError },
		);

	// Background: fetch from remote to refresh local refs, then invalidate search cache
	const utils = electronTrpc.useUtils();
	const { data: remoteBranchData } = electronTrpc.projects.getBranches.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: !!projectId },
	);
	const prevRemoteDataRef = useRef(remoteBranchData);
	useEffect(() => {
		if (remoteBranchData && remoteBranchData !== prevRemoteDataRef.current) {
			prevRemoteDataRef.current = remoteBranchData;
			void utils.projects.searchBranches.invalidate();
		}
	}, [remoteBranchData, utils]);

	// Combine: prefer searchBranches, fall back to getBranchesLocal; always filter client-side
	const allBranchData = useMemo(() => {
		const source = searchData && !isSearchError ? searchData : localBranchData;
		if (!source) return undefined;
		const query = draft.branchesQuery.trim().toLowerCase();
		const filtered = query
			? source.branches.filter((b) => b.name.toLowerCase().includes(query))
			: source.branches;
		return {
			branches: filtered,
			defaultBranch: source.defaultBranch,
			totalCount: filtered.length,
		};
	}, [searchData, isSearchError, localBranchData, draft.branchesQuery]);

	const effectiveData = useMemo(
		() =>
			allBranchData
				? {
						...allBranchData,
						branches: allBranchData.branches.slice(0, displayLimit),
						hasMore: allBranchData.branches.length > displayLimit,
					}
				: undefined,
		[allBranchData, displayLimit],
	);

	const { data: allWorkspaces = [] } =
		electronTrpc.workspaces.getAll.useQuery();
	const { data: trackedWorktrees = [] } =
		electronTrpc.workspaces.getWorktreesByProject.useQuery(
			{ projectId: projectId ?? "" },
			{ enabled: !!projectId },
		);
	const {
		data: externalWorktrees = [],
		isLoading: isExternalWorktreesLoading,
	} = electronTrpc.workspaces.getExternalWorktrees.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: !!projectId },
	);

	const workspaceByBranch = useMemo(() => {
		const map = new Map<string, string>();
		for (const w of allWorkspaces) {
			if (w.projectId === projectId) {
				map.set(w.branch, w.id);
			}
		}
		return map;
	}, [allWorkspaces, projectId]);

	const trackedWorktreeByBranch = useMemo(() => {
		const map = new Map<
			string,
			{ worktreeId: string; existsOnDisk: boolean }
		>();
		for (const worktree of trackedWorktrees) {
			if (worktree.hasActiveWorkspace) continue;
			map.set(worktree.branch, {
				worktreeId: worktree.id,
				existsOnDisk: worktree.existsOnDisk,
			});
		}
		return map;
	}, [trackedWorktrees]);

	const externalWorktreeByBranch = useMemo(() => {
		const map = new Map<string, { path: string }>();
		for (const worktree of externalWorktrees) {
			map.set(worktree.branch, { path: worktree.path });
		}
		return map;
	}, [externalWorktrees]);

	// For "all" mode, use server-side searched data
	const serverBranchRows = useMemo(() => {
		if (!effectiveData) return [];
		return effectiveData.branches.map((branch) => {
			const action = resolveBranchAction({
				branchName: branch.name,
				workspaceByBranch,
				trackedWorktreeByBranch,
				externalWorktreeByBranch,
			});
			return { branch, action };
		});
	}, [
		effectiveData,
		workspaceByBranch,
		trackedWorktreeByBranch,
		externalWorktreeByBranch,
	]);

	// For "worktrees" mode, keep client-side (small dataset).
	// Uses allBranchData (unpaginated) so metadata is available for all worktree branches.
	const worktreeBranchRows = useMemo(() => {
		const query = draft.branchesQuery.trim().toLowerCase();
		return externalWorktrees
			.filter((wt) => !query || wt.branch.toLowerCase().includes(query))
			.map((worktree) => {
				const branch = allBranchData?.branches.find(
					(b) => b.name === worktree.branch,
				) ?? {
					name: worktree.branch,
					lastCommitDate: 0,
					isLocal: true,
					isRemote: false,
				};
				const action = resolveBranchAction({
					branchName: worktree.branch,
					workspaceByBranch,
					trackedWorktreeByBranch,
					externalWorktreeByBranch,
				});
				return { branch, action };
			})
			.sort((a, b) => {
				const defaultBranch = allBranchData?.defaultBranch ?? "main";
				if (a.branch.name === defaultBranch) return -1;
				if (b.branch.name === defaultBranch) return 1;
				if (a.branch.isLocal !== b.branch.isLocal) {
					return a.branch.isLocal ? -1 : 1;
				}
				return a.branch.name.localeCompare(b.branch.name);
			});
	}, [
		externalWorktrees,
		allBranchData,
		workspaceByBranch,
		trackedWorktreeByBranch,
		externalWorktreeByBranch,
		draft.branchesQuery,
	]);

	const visibleBranchRows =
		filterMode === "worktrees" ? worktreeBranchRows : serverBranchRows;

	// Infinite scroll: load more when sentinel is visible
	const sentinelRef = useRef<HTMLDivElement>(null);
	const hasMore = filterMode === "all" && (effectiveData?.hasMore ?? false);
	useEffect(() => {
		const el = sentinelRef.current;
		if (!el || !hasMore) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					setDisplayLimit((prev) => prev + PAGE_SIZE);
				}
			},
			{ threshold: 0 },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [hasMore]);

	const handleCreate = useCallback(
		(branchName: string) => {
			if (!projectId) return;
			void runAsyncAction(
				createWorkspace.mutateAsync(
					buildCreateWorkspaceFromBranchInput(projectId, branchName),
				),
				{
					loading: "Creating workspace from branch...",
					success: "Workspace created",
					error: (err) =>
						err instanceof Error ? err.message : "Failed to create workspace",
				},
			);
		},
		[createWorkspace, projectId, runAsyncAction],
	);

	const handleOpen = useCallback(
		(workspaceId: string) => {
			closeAndResetDraft();
			navigateToWorkspace(workspaceId, navigate);
		},
		[closeAndResetDraft, navigate],
	);

	const handleOpenTrackedWorktree = useCallback(
		(worktreeId: string, branchName: string) => {
			void runAsyncAction(openTrackedWorktree.mutateAsync({ worktreeId }), {
				loading: "Importing worktree...",
				success: `Imported ${branchName}`,
				error: (err) =>
					err instanceof Error ? err.message : "Failed to import worktree",
			});
		},
		[openTrackedWorktree, runAsyncAction],
	);

	const handleImportExternalWorktree = useCallback(
		(branchName: string, worktreePath: string) => {
			if (!projectId) return;
			void runAsyncAction(
				openExternalWorktree.mutateAsync({
					projectId,
					worktreePath,
					branch: branchName,
				}),
				{
					loading: "Importing worktree...",
					success: `Imported ${branchName}`,
					error: (err) =>
						err instanceof Error ? err.message : "Failed to import worktree",
				},
			);
		},
		[openExternalWorktree, projectId, runAsyncAction],
	);

	const handleBranchAction = useCallback(
		(branchName: string) => {
			const action = resolveBranchAction({
				branchName,
				workspaceByBranch,
				trackedWorktreeByBranch,
				externalWorktreeByBranch,
			});

			if (action.kind === "open-workspace") {
				handleOpen(action.workspaceId);
				return;
			}

			if (action.kind === "open-worktree") {
				handleOpenTrackedWorktree(action.worktreeId, branchName);
				return;
			}

			if (action.kind === "import-worktree") {
				handleImportExternalWorktree(branchName, action.worktreePath);
				return;
			}

			handleCreate(branchName);
		},
		[
			externalWorktreeByBranch,
			handleCreate,
			handleImportExternalWorktree,
			handleOpen,
			handleOpenTrackedWorktree,
			trackedWorktreeByBranch,
			workspaceByBranch,
		],
	);

	const handleImportAll = useCallback(async () => {
		if (!projectId) return;

		try {
			const result = await importAllWorktrees.mutateAsync({ projectId });
			toast.success(
				`Imported ${result.imported} workspace${result.imported === 1 ? "" : "s"}`,
			);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to import worktrees",
			);
		}
	}, [importAllWorktrees, projectId]);

	if (!projectId) {
		return (
			<CommandGroup>
				<CommandEmpty>Select a project to view branches.</CommandEmpty>
			</CommandGroup>
		);
	}

	if (
		!allBranchData &&
		(isSearchLoading || (isSearchError && isLocalLoading)) &&
		filterMode === "all"
	) {
		return (
			<CommandGroup>
				<CommandEmpty>Loading branches...</CommandEmpty>
			</CommandGroup>
		);
	}

	return (
		<>
			<div className="flex items-center justify-between gap-3 border-b px-2 py-2">
				<div className="flex items-center gap-1 rounded-md bg-muted/40 p-0.5">
					{(["all", "worktrees"] as const).map((value) => {
						const count =
							value === "all"
								? (effectiveData?.totalCount ?? 0)
								: worktreeBranchRows.length;
						return (
							<button
								key={value}
								type="button"
								onClick={() => setFilterMode(value)}
								className={cn(
									"rounded px-2 py-1 text-xs transition-colors",
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
				{filterMode === "worktrees" && (
					<Button
						size="xs"
						variant="outline"
						onClick={() => void handleImportAll()}
						disabled={
							importAllWorktrees.isPending || worktreeBranchRows.length === 0
						}
					>
						{importAllWorktrees.isPending ? "Importing..." : "Import all"}
					</Button>
				)}
			</div>
			<CommandGroup>
				<CommandEmpty>
					{filterMode === "worktrees" && isExternalWorktreesLoading
						? "Loading worktree branches..."
						: filterMode === "worktrees"
							? "No worktree branches found."
							: "No branches found."}
				</CommandEmpty>
				{visibleBranchRows.map(({ branch, action }) => {
					const existingWorkspaceId =
						action.kind === "open-workspace" ? action.workspaceId : undefined;
					const isImportAction =
						action.kind === "open-worktree" ||
						action.kind === "import-worktree";
					const buttonLabel =
						action.kind === "open-workspace"
							? "Open"
							: isImportAction
								? "Import"
								: "Create";
					return (
						<CommandItem
							key={branch.name}
							onSelect={() => handleBranchAction(branch.name)}
							className="group h-12"
						>
							{existingWorkspaceId ? (
								<GoArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
							) : branch.isLocal ? (
								<GoGitBranch className="size-4 shrink-0 text-muted-foreground" />
							) : (
								<GoGlobe className="size-4 shrink-0 text-muted-foreground" />
							)}
							<span className="truncate flex-1">{branch.name}</span>
							{existingWorkspaceId ? (
								<span className="shrink-0 hidden group-data-[selected=true]:inline-flex items-center gap-1.5">
									<Button
										size="xs"
										variant="outline"
										onClick={(e) => {
											e.stopPropagation();
											handleOpen(existingWorkspaceId);
										}}
									>
										Open ↵
									</Button>
									<Button
										size="xs"
										onClick={(e) => {
											e.stopPropagation();
											handleCreate(branch.name);
										}}
									>
										Duplicate branch {modKey}↵
									</Button>
								</span>
							) : (
								<Button
									size="xs"
									className="shrink-0 hidden group-data-[selected=true]:inline-flex"
									onClick={(e) => {
										e.stopPropagation();
										handleBranchAction(branch.name);
									}}
								>
									{buttonLabel} ↵
								</Button>
							)}
						</CommandItem>
					);
				})}
				{hasMore && (
					<div
						ref={sentinelRef}
						className="flex items-center justify-center py-2 text-xs text-muted-foreground"
					/>
				)}
			</CommandGroup>
		</>
	);
}
