import type { AppRouter } from "@superset/host-service";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import type { inferRouterOutputs } from "@trpc/server";
import { GitBranch, Pencil } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
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
			{/* Branch name */}
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

			{/* Commits from base */}
			<div className="text-[11px] text-muted-foreground">
				{commitCount} {commitCount === 1 ? "commit" : "commits"} from{" "}
				<BaseBranchSelector
					branches={branches}
					currentValue={defaultBranchName}
					onChange={onBaseBranchChange}
				/>
			</div>

			{/* Remote status */}
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

			{/* Filter + stats */}
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

	const status = workspaceTrpc.git.getStatus.useQuery(
		{ workspaceId, baseBranch: baseBranch ?? undefined },
		{ refetchInterval: 3_000, refetchOnWindowFocus: true },
	);

	const commits = workspaceTrpc.git.listCommits.useQuery(
		{ workspaceId, baseBranch: baseBranch ?? undefined },
		{ refetchInterval: 3_000, refetchOnWindowFocus: true },
	);

	const branches = workspaceTrpc.git.listBranches.useQuery(
		{ workspaceId },
		{ refetchInterval: 30_000, refetchOnWindowFocus: true },
	);

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

	// Can only rename if branch hasn't been pushed (aheadCount === total commits means nothing pushed)
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

	const totalChanges = status.data
		? status.data.againstBase.length +
			status.data.staged.length +
			status.data.unstaged.length
		: 0;

	const totalAdditions = status.data
		? [
				...status.data.againstBase,
				...status.data.staged,
				...status.data.unstaged,
			].reduce((sum, f) => sum + f.additions, 0)
		: 0;

	const totalDeletions = status.data
		? [
				...status.data.againstBase,
				...status.data.staged,
				...status.data.unstaged,
			].reduce((sum, f) => sum + f.deletions, 0)
		: 0;

	const content = useMemo(() => {
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

		let fileList: React.ReactNode;

		if (filter.kind === "commit" || filter.kind === "range") {
			fileList = (
				<ChangesFileList
					files={commitFiles.data?.files ?? []}
					isLoading={commitFiles.isLoading}
					onSelectFile={onSelectFile}
					category="against-base"
				/>
			);
		} else if (filter.kind === "uncommitted") {
			fileList = (
				<ChangesFileList
					files={[...status.data.staged, ...status.data.unstaged]}
					onSelectFile={onSelectFile}
					category="unstaged"
				/>
			);
		} else {
			// Merge all files into a single flat list, deduplicating by path
			// (a file can appear in both againstBase and staged/unstaged)
			const allFilesMap = new Map<
				string,
				(typeof status.data.againstBase)[number]
			>();
			for (const f of status.data.againstBase) allFilesMap.set(f.path, f);
			for (const f of status.data.staged) allFilesMap.set(f.path, f);
			for (const f of status.data.unstaged) allFilesMap.set(f.path, f);

			fileList = (
				<ChangesFileList
					files={Array.from(allFilesMap.values())}
					onSelectFile={onSelectFile}
					category="against-base"
				/>
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
					onFilterChange={setFilter}
					commits={commits.data?.commits ?? []}
					uncommittedCount={
						status.data.staged.length + status.data.unstaged.length
					}
					branches={branches.data?.branches ?? []}
					onBaseBranchChange={setBaseBranch}
					onRenameBranch={handleRenameBranch}
					canRename={canRenameBranch}
				/>
				<div className="min-h-0 flex-1 overflow-y-auto">{fileList}</div>
			</div>
		);
	}, [
		status.data,
		status.isLoading,
		filter,
		commitFiles.data,
		commitFiles.isLoading,
		commits.data,
		totalChanges,
		totalAdditions,
		totalDeletions,
		onSelectFile,
		setFilter,
		branches.data?.branches,
		canRenameBranch,
		handleRenameBranch,
		setBaseBranch,
	]);

	return {
		id: "changes",
		label: "Changes",
		badge: totalChanges > 0 ? totalChanges : undefined,
		content,
	};
}
