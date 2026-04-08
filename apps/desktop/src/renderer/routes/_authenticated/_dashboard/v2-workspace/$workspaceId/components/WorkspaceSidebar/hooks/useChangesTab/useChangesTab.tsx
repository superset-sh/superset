import type { AppRouter } from "@superset/host-service";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import type { inferRouterOutputs } from "@trpc/server";
import { GitBranch, Pencil } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { ChangesFilter } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import type { SidebarTabDefinition } from "../../types";
import { BaseBranchSelector } from "./components/BaseBranchSelector";
import { ChangesFileList } from "./components/ChangesFileList";
import { CommitFilterDropdown } from "./components/CommitFilterDropdown";

export type { ChangesFilter };

type RouterOutputs = inferRouterOutputs<AppRouter>;
type Commit = RouterOutputs["git"]["listCommits"]["commits"][number];

interface UseChangesTabParams {
	workspaceId: string;
	onSelectFile?: (
		path: string,
		category: "against-base" | "staged" | "unstaged",
	) => void;
}

type Branch = RouterOutputs["git"]["listBranches"]["branches"][number];

function ChangesHeader({
	currentBranch,
	defaultBranchName,
	commitCount,
	totalFiles,
	totalAdditions,
	totalDeletions,
	onRenameBranch,
	canRename,
	filter,
	onFilterChange,
	commits,
	uncommittedCount,
	branches,
	onBaseBranchChange,
}: {
	currentBranch: { name: string; aheadCount: number; behindCount: number };
	defaultBranchName: string;
	commitCount: number;
	totalFiles: number;
	totalAdditions: number;
	totalDeletions: number;
	filter: ChangesFilter;
	onFilterChange: (filter: ChangesFilter) => void;
	commits: Commit[];
	uncommittedCount: number;
	branches: Branch[];
	onBaseBranchChange: (branchName: string) => void;
	onRenameBranch: (newName: string) => void;
	canRename: boolean;
}) {
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState(currentBranch.name);
	const inputRef = useRef<HTMLInputElement>(null);

	const startEditing = () => {
		setEditValue(currentBranch.name);
		setIsEditing(true);
		requestAnimationFrame(() => inputRef.current?.select());
	};

	const handleSubmit = () => {
		const trimmed = editValue.trim();
		if (trimmed && trimmed !== currentBranch.name) {
			onRenameBranch(trimmed);
		}
		setIsEditing(false);
	};

	return (
		<div className="border-b border-border bg-muted/30 px-3 py-2.5 space-y-1.5">
			<div className="group flex items-center gap-1.5 text-xs">
				<GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
				{isEditing ? (
					<input
						ref={inputRef}
						value={editValue}
						onChange={(e) => setEditValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleSubmit();
							if (e.key === "Escape") setIsEditing(false);
						}}
						onBlur={handleSubmit}
						className="min-w-0 flex-1 truncate bg-transparent font-medium outline-none ring-1 ring-ring rounded-sm px-1"
					/>
				) : (
					<>
						<span className="truncate font-medium">{currentBranch.name}</span>
						{canRename && (
							<button
								type="button"
								onClick={startEditing}
								className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
							>
								<Pencil className="size-3" />
							</button>
						)}
					</>
				)}
			</div>

			<div className="text-[11px] text-muted-foreground">
				{commitCount} {commitCount === 1 ? "commit" : "commits"} from{" "}
				<BaseBranchSelector
					branches={branches}
					currentValue={defaultBranchName}
					onChange={onBaseBranchChange}
				/>
			</div>

			{currentBranch.aheadCount > 0 && currentBranch.behindCount > 0 && (
				<div className="text-[11px] text-muted-foreground">
					<div>Your branch and</div>
					<div className="font-medium text-foreground">
						origin/{currentBranch.name}
					</div>
					<div>have diverged</div>
					<div>
						{currentBranch.aheadCount} local not pushed,{" "}
						{currentBranch.behindCount} remote to pull
					</div>
				</div>
			)}
			{currentBranch.aheadCount > 0 && currentBranch.behindCount === 0 && (
				<div className="text-[11px] text-muted-foreground">
					<div>
						{currentBranch.aheadCount}{" "}
						{currentBranch.aheadCount === 1 ? "commit" : "commits"} ahead of
					</div>
					<div className="font-medium text-foreground">
						origin/{currentBranch.name}
					</div>
				</div>
			)}
			{currentBranch.behindCount > 0 && currentBranch.aheadCount === 0 && (
				<div className="text-[11px] text-muted-foreground">
					<div>
						{currentBranch.behindCount}{" "}
						{currentBranch.behindCount === 1 ? "commit" : "commits"} behind
					</div>
					<div className="font-medium text-foreground">
						origin/{currentBranch.name}
					</div>
				</div>
			)}

			<div className="flex items-center justify-between pt-0.5">
				<CommitFilterDropdown
					filter={filter}
					onFilterChange={onFilterChange}
					commits={commits}
					uncommittedCount={uncommittedCount}
				/>
				<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<span>{totalFiles} files changed</span>
					{(totalAdditions > 0 || totalDeletions > 0) && (
						<span>
							{totalAdditions > 0 && (
								<span className="text-green-400">+{totalAdditions}</span>
							)}
							{totalAdditions > 0 && totalDeletions > 0 && " "}
							{totalDeletions > 0 && (
								<span className="text-red-400">-{totalDeletions}</span>
							)}
						</span>
					)}
				</div>
			</div>
		</div>
	);
}

type ChangedFile =
	RouterOutputs["git"]["getStatus"]["againstBase"][number];

interface ChangesTabContentProps {
	status: { data: RouterOutputs["git"]["getStatus"] | undefined; isLoading: boolean };
	commits: { data: RouterOutputs["git"]["listCommits"] | undefined };
	branches: { data: RouterOutputs["git"]["listBranches"] | undefined };
	commitFiles: { data: { files: ChangedFile[] } | undefined; isLoading: boolean };
	filter: ChangesFilter;
	filteredFiles: ChangedFile[];
	fileCategory: "against-base" | "staged" | "unstaged";
	totalChanges: number;
	totalAdditions: number;
	totalDeletions: number;
	onSelectFile?: (path: string, category: "against-base" | "staged" | "unstaged") => void;
	onFilterChange: (filter: ChangesFilter) => void;
	onBaseBranchChange: (branchName: string) => void;
	onRenameBranch: (newName: string) => void;
	canRenameBranch: boolean;
}

const ChangesTabContent = memo(function ChangesTabContent({
	status,
	commits,
	branches,
	commitFiles,
	filter,
	filteredFiles,
	fileCategory,
	totalChanges,
	totalAdditions,
	totalDeletions,
	onSelectFile,
	onFilterChange,
	onBaseBranchChange,
	onRenameBranch,
	canRenameBranch,
}: ChangesTabContentProps) {
	if (status.isLoading) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Loading changes...
			</div>
		);
	}

	if (!status.data) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Unable to load git status
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<ChangesHeader
				currentBranch={status.data.currentBranch}
				defaultBranchName={status.data.defaultBranch.name}
				commitCount={commits.data?.commits.length ?? 0}
				totalFiles={totalChanges}
				totalAdditions={totalAdditions}
				totalDeletions={totalDeletions}
				filter={filter}
				onFilterChange={onFilterChange}
				commits={commits.data?.commits ?? []}
				uncommittedCount={
					status.data.staged.length + status.data.unstaged.length
				}
				branches={branches.data?.branches ?? []}
				onBaseBranchChange={onBaseBranchChange}
				onRenameBranch={onRenameBranch}
				canRename={canRenameBranch}
			/>
			<div className="min-h-0 flex-1 overflow-y-auto">
				<ChangesFileList
					files={filteredFiles}
					isLoading={
						(filter.kind === "commit" || filter.kind === "range")
							? commitFiles.isLoading
							: false
					}
					onSelectFile={onSelectFile}
					category={fileCategory}
				/>
			</div>
		</div>
	);
});

export function useChangesTab({
	workspaceId,
	onSelectFile,
}: UseChangesTabParams): SidebarTabDefinition {
	const collections = useCollections();
	const localState = collections.v2WorkspaceLocalState.get(workspaceId);
	const filter: ChangesFilter = localState?.sidebarState?.changesFilter ?? {
		kind: "all",
	};
	const baseBranch: string | null =
		localState?.sidebarState?.baseBranch ?? null;

	const setFilter = useCallback(
		(next: ChangesFilter) => {
			if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.sidebarState.changesFilter = next;
			});
		},
		[collections, workspaceId],
	);

	const setBaseBranch = useCallback(
		(branchName: string) => {
			if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.sidebarState.baseBranch = branchName;
			});
		},
		[collections, workspaceId],
	);

	const statusUtils = workspaceTrpc.useUtils();

	const status = workspaceTrpc.git.getStatus.useQuery(
		{ workspaceId, baseBranch: baseBranch ?? undefined },
		{ refetchOnWindowFocus: true },
	);

	const commits = workspaceTrpc.git.listCommits.useQuery(
		{ workspaceId, baseBranch: baseBranch ?? undefined },
		{ refetchOnWindowFocus: true },
	);

	const branches = workspaceTrpc.git.listBranches.useQuery(
		{ workspaceId },
		{ refetchInterval: 30_000, refetchOnWindowFocus: true },
	);

	const invalidateGitQueries = useCallback(() => {
		void statusUtils.git.getStatus.invalidate({ workspaceId });
		void statusUtils.git.listCommits.invalidate({ workspaceId });
	}, [statusUtils, workspaceId]);

	// Shared debounce for git:changed and fs:events — batches rapid events
	// from either source into a single git status refresh.
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const debouncedInvalidate = useCallback(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			debounceRef.current = null;
			invalidateGitQueries();
		}, 300);
	}, [invalidateGitQueries]);
	useEffect(() => {
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [workspaceId]);

	useWorkspaceEvent("git:changed", workspaceId, debouncedInvalidate);
	useWorkspaceEvent("fs:events", workspaceId, debouncedInvalidate);

	const renameBranchMutation = workspaceTrpc.git.renameBranch.useMutation();

	const handleRenameBranch = useCallback(
		(newName: string) => {
			const currentName = status.data?.currentBranch.name;
			if (!currentName) return;
			toast.promise(
				renameBranchMutation.mutateAsync({
					workspaceId,
					oldName: currentName,
					newName,
				}),
				{
					loading: `Renaming branch to ${newName}...`,
					success: `Branch renamed to ${newName}`,
					error: (err) =>
						err instanceof Error ? err.message : "Failed to rename branch",
				},
			);
		},
		[workspaceId, status.data?.currentBranch.name, renameBranchMutation],
	);

	// Only allow rename for branches with no upstream (never pushed)
	const canRenameBranch = !status.data?.currentBranch.upstream;

	const commitFilesInput =
		filter.kind === "commit"
			? { workspaceId, commitHash: filter.hash }
			: filter.kind === "range"
				? { workspaceId, commitHash: filter.toHash, fromHash: filter.fromHash }
				: { workspaceId, commitHash: "" };

	const commitFiles = workspaceTrpc.git.getCommitFiles.useQuery(
		commitFilesInput,
		{ enabled: filter.kind === "commit" || filter.kind === "range" },
	);

	const filteredFiles = useMemo(() => {
		if (!status.data) return [];
		if (filter.kind === "uncommitted") {
			return [...status.data.staged, ...status.data.unstaged];
		}
		if (filter.kind === "commit" || filter.kind === "range") {
			return commitFiles.data?.files ?? [];
		}
		// Deduplicate — a file can appear in multiple categories
		const map = new Map<string, (typeof status.data.againstBase)[number]>();
		for (const f of status.data.againstBase) map.set(f.path, f);
		for (const f of status.data.staged) map.set(f.path, f);
		for (const f of status.data.unstaged) map.set(f.path, f);
		return Array.from(map.values());
	}, [status.data, filter.kind, commitFiles.data?.files]);

	const totalChanges = filteredFiles.length;
	const totalAdditions = filteredFiles.reduce((sum, f) => sum + f.additions, 0);
	const totalDeletions = filteredFiles.reduce((sum, f) => sum + f.deletions, 0);

	const fileCategory: "against-base" | "staged" | "unstaged" =
		filter.kind === "uncommitted" ? "unstaged" : "against-base";

	const content = (
		<ChangesTabContent
			status={status}
			commits={commits}
			branches={branches}
			commitFiles={commitFiles}
			filter={filter}
			filteredFiles={filteredFiles}
			fileCategory={fileCategory}
			totalChanges={totalChanges}
			totalAdditions={totalAdditions}
			totalDeletions={totalDeletions}
			onSelectFile={onSelectFile}
			onFilterChange={setFilter}
			onBaseBranchChange={setBaseBranch}
			onRenameBranch={handleRenameBranch}
			canRenameBranch={canRenameBranch}
		/>
	);

	return {
		id: "changes",
		label: "Changes",
		badge: totalChanges > 0 ? totalChanges : undefined,
		content,
	};
}
