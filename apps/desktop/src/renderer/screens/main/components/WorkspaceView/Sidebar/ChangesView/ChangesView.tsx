import { ScrollArea } from "@superset/ui/scroll-area";
import { useEffect, useState } from "react";
import { trpc } from "renderer/lib/trpc";
import { useChangesStore } from "renderer/stores/changes";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { CategorySection } from "./components/CategorySection";
import { ChangesHeader } from "./components/ChangesHeader";
import { CommitItem } from "./components/CommitItem";
import { FileList } from "./components/FileList";

export function ChangesView() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const worktreePath = activeWorkspace?.worktreePath;

	const { baseBranch } = useChangesStore();
	const { data: branchData } = trpc.changes.getBranches.useQuery(
		{ worktreePath: worktreePath || "" },
		{ enabled: !!worktreePath },
	);

	const effectiveBaseBranch = baseBranch ?? branchData?.defaultBranch ?? "main";

	const {
		data: status,
		isLoading,
		isFetching,
		refetch,
	} = trpc.changes.getStatus.useQuery(
		{ worktreePath: worktreePath || "", defaultBranch: effectiveBaseBranch },
		{
			enabled: !!worktreePath,
			refetchInterval: 2500,
			refetchOnWindowFocus: true,
		},
	);

	const {
		expandedSections,
		fileListViewMode,
		selectFile,
		getSelectedFile,
		toggleSection,
		setFileListViewMode,
	} = useChangesStore();

	const selectedFileState = getSelectedFile(worktreePath || "");
	const selectedFile = selectedFileState?.file ?? null;
	const selectedCommitHash = selectedFileState?.commitHash ?? null;

	const [expandedCommits, setExpandedCommits] = useState<Set<string>>(
		new Set(),
	);

	// Reset expanded commits when workspace changes to avoid querying
	// old commit hashes against the new worktree
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally resets on worktreePath change
	useEffect(() => {
		setExpandedCommits(new Set());
	}, [worktreePath]);

	const commitFilesQueries = trpc.useQueries((t) =>
		Array.from(expandedCommits).map((hash) =>
			t.changes.getCommitFiles({
				worktreePath: worktreePath || "",
				commitHash: hash,
			}),
		),
	);

	const commitFilesMap = new Map<string, ChangedFile[]>();
	Array.from(expandedCommits).forEach((hash, index) => {
		const query = commitFilesQueries[index];
		if (query?.data) {
			commitFilesMap.set(hash, query.data);
		}
	});

	const handleFileSelect = (file: ChangedFile, category: ChangeCategory) => {
		if (!worktreePath) return;
		selectFile(worktreePath, file, category, null);
	};

	const handleCommitFileSelect = (file: ChangedFile, commitHash: string) => {
		if (!worktreePath) return;
		selectFile(worktreePath, file, "committed", commitHash);
	};

	const handleCommitToggle = (hash: string) => {
		setExpandedCommits((prev) => {
			const next = new Set(prev);
			if (next.has(hash)) {
				next.delete(hash);
			} else {
				next.add(hash);
			}
			return next;
		});
	};

	if (!worktreePath) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
				No workspace selected
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
				Loading changes...
			</div>
		);
	}

	if (
		!status ||
		!status.againstMain ||
		!status.commits ||
		!status.staged ||
		!status.unstaged ||
		!status.untracked
	) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
				Unable to load changes
			</div>
		);
	}

	const hasChanges =
		status.againstMain.length > 0 ||
		status.commits.length > 0 ||
		status.staged.length > 0 ||
		status.unstaged.length > 0 ||
		status.untracked.length > 0;

	const commitsWithFiles = status.commits.map((commit) => ({
		...commit,
		files: commitFilesMap.get(commit.hash) || [],
	}));

	const unstagedFiles = [...status.unstaged, ...status.untracked];

	return (
		<div className="flex flex-col h-full">
			<ChangesHeader
				ahead={status.ahead}
				behind={status.behind}
				isRefreshing={isFetching}
				onRefresh={() => refetch()}
				viewMode={fileListViewMode}
				onViewModeChange={setFileListViewMode}
				worktreePath={worktreePath}
			/>

			{!hasChanges ? (
				<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm px-4 text-center">
					No changes detected
				</div>
			) : (
				<ScrollArea className="flex-1">
					{/* Against Main */}
					<CategorySection
						title="Against Main"
						count={status.againstMain.length}
						isExpanded={expandedSections["against-main"]}
						onToggle={() => toggleSection("against-main")}
					>
						<FileList
							files={status.againstMain}
							viewMode={fileListViewMode}
							selectedFile={selectedFile}
							selectedCommitHash={selectedCommitHash}
							onFileSelect={(file) => handleFileSelect(file, "against-main")}
						/>
					</CategorySection>

					{/* Commits */}
					<CategorySection
						title="Commits"
						count={status.commits.length}
						isExpanded={expandedSections.committed}
						onToggle={() => toggleSection("committed")}
					>
						{commitsWithFiles.map((commit) => (
							<CommitItem
								key={commit.hash}
								commit={commit}
								isExpanded={expandedCommits.has(commit.hash)}
								onToggle={() => handleCommitToggle(commit.hash)}
								selectedFile={selectedFile}
								selectedCommitHash={selectedCommitHash}
								onFileSelect={handleCommitFileSelect}
								viewMode={fileListViewMode}
							/>
						))}
					</CategorySection>

					{/* Staged */}
					<CategorySection
						title="Staged"
						count={status.staged.length}
						isExpanded={expandedSections.staged}
						onToggle={() => toggleSection("staged")}
					>
						<FileList
							files={status.staged}
							viewMode={fileListViewMode}
							selectedFile={selectedFile}
							selectedCommitHash={selectedCommitHash}
							onFileSelect={(file) => handleFileSelect(file, "staged")}
						/>
					</CategorySection>

					{/* Unstaged */}
					<CategorySection
						title="Unstaged"
						count={unstagedFiles.length}
						isExpanded={expandedSections.unstaged}
						onToggle={() => toggleSection("unstaged")}
					>
						<FileList
							files={unstagedFiles}
							viewMode={fileListViewMode}
							selectedFile={selectedFile}
							selectedCommitHash={selectedCommitHash}
							onFileSelect={(file) => handleFileSelect(file, "unstaged")}
						/>
					</CategorySection>
				</ScrollArea>
			)}
		</div>
	);
}
