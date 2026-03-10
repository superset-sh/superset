import { Button } from "@superset/ui/button";
import { CommandEmpty, CommandGroup, CommandItem } from "@superset/ui/command";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import Fuse from "fuse.js";
import { useCallback, useMemo, useState } from "react";
import { GoArrowUpRight, GoGitBranch, GoGlobe } from "react-icons/go";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	useCreateBranchWorkspace,
	useHandleOpenedWorktree,
	useImportAllWorktrees,
	useOpenExternalWorktree,
} from "renderer/react-query/workspaces";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useHotkeysStore } from "renderer/stores/hotkeys/store";
import { useNewWorkspaceModalDraft } from "../../NewWorkspaceModalDraftContext";
import { resolveBranchAction } from "./resolveBranchAction";

interface BranchesGroupProps {
	projectId: string | null;
}

type BranchFilterMode = "all" | "worktrees";

export function BranchesGroup({ projectId }: BranchesGroupProps) {
	const platform = useHotkeysStore((state) => state.platform);
	const modKey = platform === "darwin" ? "⌘" : "Ctrl";
	const navigate = useNavigate();
	const createBranchWorkspace = useCreateBranchWorkspace();
	const handleOpenedWorktree = useHandleOpenedWorktree();
	const importAllWorktrees = useImportAllWorktrees();
	const openExternalWorktree = useOpenExternalWorktree();
	const { draft, closeAndResetDraft, runAsyncAction } =
		useNewWorkspaceModalDraft();
	const [filterMode, setFilterMode] = useState<BranchFilterMode>("all");

	// Fast query: local branches + cached remote refs (no network)
	const { data: localData, isLoading: isLocalLoading } =
		electronTrpc.projects.getBranchesLocal.useQuery(
			{ projectId: projectId ?? "" },
			{ enabled: !!projectId },
		);

	// Slow query: fetches from remote, runs in background
	const { data: remoteData } = electronTrpc.projects.getBranches.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: !!projectId },
	);

	// Use remote data when available, fall back to local data
	const data = remoteData ?? localData;

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

	const defaultBranch = data?.defaultBranch ?? "main";

	const branches = (data?.branches ?? []).sort((a, b) => {
		if (a.name === defaultBranch) return -1;
		if (b.name === defaultBranch) return 1;
		if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
	const branchByName = useMemo(() => {
		return new Map(branches.map((branch) => [branch.name, branch]));
	}, [branches]);

	const branchRows = useMemo(() => {
		return branches.map((branch) => {
			const action = resolveBranchAction({
				branchName: branch.name,
				workspaceByBranch,
				trackedWorktreeByBranch,
				externalWorktreeByBranch,
			});

			return {
				branch,
				action,
				isWorktreeBranch: externalWorktreeByBranch.has(branch.name),
			};
		});
	}, [
		branches,
		externalWorktreeByBranch,
		trackedWorktreeByBranch,
		workspaceByBranch,
	]);

	const worktreeBranchRows = useMemo(() => {
		return externalWorktrees
			.map((worktree) => {
				const branch = branchByName.get(worktree.branch) ?? {
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

				return {
					branch,
					action,
					isWorktreeBranch: true,
				};
			})
			.sort((a, b) => {
				if (a.branch.name === defaultBranch) return -1;
				if (b.branch.name === defaultBranch) return 1;
				if (a.branch.isLocal !== b.branch.isLocal) {
					return a.branch.isLocal ? -1 : 1;
				}
				return a.branch.name.localeCompare(b.branch.name);
			});
	}, [
		branchByName,
		defaultBranch,
		externalWorktreeByBranch,
		externalWorktrees,
		trackedWorktreeByBranch,
		workspaceByBranch,
	]);

	const baseBranchRows = useMemo(() => {
		if (filterMode === "worktrees") {
			return worktreeBranchRows;
		}
		return branchRows;
	}, [branchRows, filterMode, worktreeBranchRows]);

	const debouncedQuery = useDebouncedValue(draft.branchesQuery, 150);

	const branchFuse = useMemo(
		() =>
			new Fuse(baseBranchRows, {
				keys: ["branch.name"],
				threshold: 0.3,
				includeScore: true,
				ignoreLocation: true,
			}),
		[baseBranchRows],
	);

	const visibleBranchRows = useMemo(() => {
		const query = debouncedQuery.trim();
		if (!query) {
			return baseBranchRows.slice(0, 100);
		}
		return branchFuse
			.search(query)
			.slice(0, 100)
			.map((result) => result.item);
	}, [debouncedQuery, baseBranchRows, branchFuse]);

	const handleCreate = useCallback(
		(branchName: string) => {
			if (!projectId) return;
			void runAsyncAction(
				createBranchWorkspace.mutateAsync({
					projectId,
					branch: branchName,
				}),
				{
					loading: "Creating workspace from branch...",
					success: "Workspace created",
					error: (err) =>
						err instanceof Error ? err.message : "Failed to create workspace",
				},
			);
		},
		[createBranchWorkspace, projectId, runAsyncAction],
	);

	const handleOpen = useCallback(
		(workspaceId: string) => {
			closeAndResetDraft();
			navigateToWorkspace(workspaceId, navigate);
		},
		[closeAndResetDraft, navigate],
	);

	const openTrackedWorktree = electronTrpc.workspaces.openWorktree.useMutation({
		onSuccess: async (data) => {
			await handleOpenedWorktree(data);
		},
	});

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

	if (isLocalLoading) {
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
							value === "all" ? branchRows.length : worktreeBranchRows.length;
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
			</CommandGroup>
		</>
	);
}
