import { toast } from "@superset/ui/sonner";
import { useCallback, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type {
	ChangeCategory,
	ChangedFile,
	CommitInfo,
	GitChangesStatus,
} from "shared/changes-types";
import { useScrollContext } from "../../context";
import { FileDiffSection } from "../FileDiffSection";

interface CategoryHeaderProps {
	title: string;
	count: number;
	isExpanded: boolean;
	onToggle: () => void;
}

function CategoryHeader({
	title,
	count,
	isExpanded,
	onToggle,
}: CategoryHeaderProps) {
	if (count === 0) return null;

	return (
		<button
			type="button"
			onClick={onToggle}
			className="flex items-center gap-2 px-4 py-2 w-full text-left bg-muted/50 hover:bg-muted transition-colors sticky top-0 z-20"
		>
			{isExpanded ? (
				<LuChevronDown className="size-4 text-muted-foreground" />
			) : (
				<LuChevronRight className="size-4 text-muted-foreground" />
			)}
			<span className="text-sm font-semibold">{title}</span>
			<span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
				{count}
			</span>
		</button>
	);
}

interface CommitSectionProps {
	commit: CommitInfo;
	worktreePath: string;
	collapsedFiles: Set<string>;
	onToggleFile: (key: string) => void;
}

function CommitSection({
	commit,
	worktreePath,
	collapsedFiles,
	onToggleFile,
}: CommitSectionProps) {
	const [isCommitExpanded, setIsCommitExpanded] = useState(true);

	const { data: commitFiles } = electronTrpc.changes.getCommitFiles.useQuery(
		{
			worktreePath,
			commitHash: commit.hash,
		},
		{ enabled: isCommitExpanded },
	);

	const files = commitFiles ?? [];

	return (
		<div className="border-b border-border">
			<button
				type="button"
				onClick={() => setIsCommitExpanded(!isCommitExpanded)}
				className="flex items-center gap-2 px-4 py-2 w-full text-left hover:bg-accent/50 transition-colors"
			>
				{isCommitExpanded ? (
					<LuChevronDown className="size-4 text-muted-foreground" />
				) : (
					<LuChevronRight className="size-4 text-muted-foreground" />
				)}
				<span className="text-xs font-mono text-muted-foreground">
					{commit.shortHash}
				</span>
				<span className="text-sm truncate flex-1">{commit.message}</span>
				<span className="text-xs text-muted-foreground">
					{commit.files.length} files
				</span>
			</button>
			{isCommitExpanded && (
				<div className="pl-4">
					{files.map((file) => {
						const fileKey = `committed:${commit.hash}:${file.path}`;
						return (
							<FileDiffSection
								key={fileKey}
								file={file}
								category="committed"
								commitHash={commit.hash}
								worktreePath={worktreePath}
								isExpanded={!collapsedFiles.has(fileKey)}
								onToggleExpanded={() => onToggleFile(fileKey)}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
}

interface InfiniteScrollViewProps {
	status: GitChangesStatus;
	worktreePath: string;
	baseBranch: string;
}

export function InfiniteScrollView({
	status,
	worktreePath,
	baseBranch,
}: InfiniteScrollViewProps) {
	const { containerRef } = useScrollContext();
	const [expandedCategories, setExpandedCategories] = useState<
		Record<ChangeCategory, boolean>
	>({
		"against-base": true,
		committed: true,
		staged: true,
		unstaged: true,
	});
	// Track collapsed files instead - files are expanded by default
	const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());

	const toggleCategory = useCallback((category: ChangeCategory) => {
		setExpandedCategories((prev) => ({
			...prev,
			[category]: !prev[category],
		}));
	}, []);

	const toggleFile = useCallback((key: string) => {
		setCollapsedFiles((prev) => {
			const next = new Set(prev);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	}, []);

	const trpcUtils = electronTrpc.useUtils();
	const refetch = useCallback(() => {
		trpcUtils.changes.getStatus.invalidate({ worktreePath });
	}, [trpcUtils, worktreePath]);

	const stageFileMutation = electronTrpc.changes.stageFile.useMutation({
		onSuccess: () => refetch(),
		onError: (error, variables) => {
			console.error(
				`[InfiniteScrollView] Failed to stage file ${variables.filePath}:`,
				error,
			);
			toast.error(`Failed to stage ${variables.filePath}: ${error.message}`);
		},
	});

	const unstageFileMutation = electronTrpc.changes.unstageFile.useMutation({
		onSuccess: () => refetch(),
		onError: (error, variables) => {
			console.error(
				`[InfiniteScrollView] Failed to unstage file ${variables.filePath}:`,
				error,
			);
			toast.error(`Failed to unstage ${variables.filePath}: ${error.message}`);
		},
	});

	const discardChangesMutation =
		electronTrpc.changes.discardChanges.useMutation({
			onSuccess: () => refetch(),
			onError: (error, variables) => {
				console.error(
					`[InfiniteScrollView] Failed to discard changes for ${variables.filePath}:`,
					error,
				);
				toast.error(`Failed to discard changes: ${error.message}`);
			},
		});

	const deleteUntrackedMutation =
		electronTrpc.changes.deleteUntracked.useMutation({
			onSuccess: () => refetch(),
			onError: (error, variables) => {
				console.error(
					`[InfiniteScrollView] Failed to delete ${variables.filePath}:`,
					error,
				);
				toast.error(`Failed to delete file: ${error.message}`);
			},
		});

	const handleDiscard = useCallback(
		(file: ChangedFile) => {
			if (file.status === "untracked" || file.status === "added") {
				deleteUntrackedMutation.mutate({
					worktreePath,
					filePath: file.path,
				});
			} else {
				discardChangesMutation.mutate({
					worktreePath,
					filePath: file.path,
				});
			}
		},
		[worktreePath, deleteUntrackedMutation, discardChangesMutation],
	);

	const unstagedFiles = [...status.unstaged, ...status.untracked];
	const hasChanges =
		status.againstBase.length > 0 ||
		status.commits.length > 0 ||
		status.staged.length > 0 ||
		unstagedFiles.length > 0;

	if (!hasChanges) {
		return (
			<div className="flex items-center justify-center h-full text-muted-foreground">
				No changes detected
			</div>
		);
	}

	const isActioning =
		stageFileMutation.isPending ||
		unstageFileMutation.isPending ||
		discardChangesMutation.isPending ||
		deleteUntrackedMutation.isPending;

	return (
		<div ref={containerRef} className="h-full overflow-y-auto">
			{status.againstBase.length > 0 && (
				<>
					<CategoryHeader
						title={`Against ${baseBranch}`}
						count={status.againstBase.length}
						isExpanded={expandedCategories["against-base"]}
						onToggle={() => toggleCategory("against-base")}
					/>
					{expandedCategories["against-base"] && (
						<div>
							{status.againstBase.map((file) => {
								const fileKey = `against-base::${file.path}`;
								return (
									<FileDiffSection
										key={fileKey}
										file={file}
										category="against-base"
										worktreePath={worktreePath}
										isExpanded={!collapsedFiles.has(fileKey)}
										onToggleExpanded={() => toggleFile(fileKey)}
									/>
								);
							})}
						</div>
					)}
				</>
			)}

			{status.commits.length > 0 && (
				<>
					<CategoryHeader
						title="Commits"
						count={status.commits.length}
						isExpanded={expandedCategories.committed}
						onToggle={() => toggleCategory("committed")}
					/>
					{expandedCategories.committed && (
						<div>
							{status.commits.map((commit) => (
								<CommitSection
									key={commit.hash}
									commit={commit}
									worktreePath={worktreePath}
									collapsedFiles={collapsedFiles}
									onToggleFile={toggleFile}
								/>
							))}
						</div>
					)}
				</>
			)}

			{status.staged.length > 0 && (
				<>
					<CategoryHeader
						title="Staged"
						count={status.staged.length}
						isExpanded={expandedCategories.staged}
						onToggle={() => toggleCategory("staged")}
					/>
					{expandedCategories.staged && (
						<div>
							{status.staged.map((file) => {
								const fileKey = `staged::${file.path}`;
								return (
									<FileDiffSection
										key={fileKey}
										file={file}
										category="staged"
										worktreePath={worktreePath}
										isExpanded={!collapsedFiles.has(fileKey)}
										onToggleExpanded={() => toggleFile(fileKey)}
										onUnstage={() =>
											unstageFileMutation.mutate({
												worktreePath,
												filePath: file.path,
											})
										}
										onDiscard={() => handleDiscard(file)}
										isActioning={isActioning}
									/>
								);
							})}
						</div>
					)}
				</>
			)}

			{unstagedFiles.length > 0 && (
				<>
					<CategoryHeader
						title="Unstaged"
						count={unstagedFiles.length}
						isExpanded={expandedCategories.unstaged}
						onToggle={() => toggleCategory("unstaged")}
					/>
					{expandedCategories.unstaged && (
						<div>
							{unstagedFiles.map((file) => {
								const fileKey = `unstaged::${file.path}`;
								return (
									<FileDiffSection
										key={fileKey}
										file={file}
										category="unstaged"
										worktreePath={worktreePath}
										isExpanded={!collapsedFiles.has(fileKey)}
										onToggleExpanded={() => toggleFile(fileKey)}
										onStage={() =>
											stageFileMutation.mutate({
												worktreePath,
												filePath: file.path,
											})
										}
										onDiscard={() => handleDiscard(file)}
										isActioning={isActioning}
									/>
								);
							})}
						</div>
					)}
				</>
			)}
		</div>
	);
}
