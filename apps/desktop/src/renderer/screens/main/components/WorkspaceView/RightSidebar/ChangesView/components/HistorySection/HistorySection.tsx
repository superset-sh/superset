import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useChangesStore } from "renderer/stores/changes";
import type { ChangedFile, CommitInfo } from "shared/changes-types";
import { VscChevronRight } from "react-icons/vsc";
import { CommitListVirtualized } from "../CommitListVirtualized";
import type { ChangesViewMode } from "../../types";

const PAGE_SIZE = 50;

interface HistorySectionProps {
	worktreePath: string;
	fileListViewMode: ChangesViewMode;
	selectedFile: ChangedFile | null;
	selectedCommitHash: string | null;
	onCommitFileSelect: (file: ChangedFile, commitHash: string) => void;
	projectId?: string;
	isExpandedView?: boolean;
	isActive: boolean;
}

export function HistorySection({
	worktreePath,
	fileListViewMode,
	selectedFile,
	selectedCommitHash,
	onCommitFileSelect,
	projectId,
	isExpandedView,
	isActive,
}: HistorySectionProps) {
	const { historyExpanded, toggleHistory } = useChangesStore();
	const [pages, setPages] = useState<CommitInfo[][]>([]);
	const [nextSkip, setNextSkip] = useState(0);
	const [hasMore, setHasMore] = useState(true);
	const isFetchingRef = useRef(false);
	const lastAppendedPageRef = useRef<CommitInfo[] | null>(null);
	const [expandedCommits, setExpandedCommits] = useState<Set<string>>(
		new Set(),
	);

	// Reset when worktree changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on workspace change
	useEffect(() => {
		setPages([]);
		setNextSkip(0);
		setHasMore(true);
		setExpandedCommits(new Set());
		lastAppendedPageRef.current = null;
	}, [worktreePath]);

	// First page query — only runs when section is expanded
	const { data: firstPage, isLoading } =
		electronTrpc.changes.getHistory.useQuery(
			{ worktreePath, maxCount: PAGE_SIZE, skip: 0 },
			{ enabled: !!worktreePath && historyExpanded && isActive },
		);

	// Store first page when it arrives
	useEffect(() => {
		if (firstPage) {
			setPages([firstPage]);
			setHasMore(firstPage.length >= PAGE_SIZE);
			setNextSkip(firstPage.length);
			isFetchingRef.current = false;
		}
	}, [firstPage]);

	// Subsequent page query — enabled only when isFetchingRef is true and nextSkip > 0
	const [fetchSkip, setFetchSkip] = useState<number | null>(null);
	const { data: nextPage } = electronTrpc.changes.getHistory.useQuery(
		{ worktreePath, maxCount: PAGE_SIZE, skip: fetchSkip ?? 0 },
		{
			enabled:
				!!worktreePath &&
				historyExpanded &&
				isActive &&
				fetchSkip !== null &&
				fetchSkip > 0,
		},
	);

	// Append next page when it arrives (guard against stale data)
	useEffect(() => {
		if (nextPage && fetchSkip !== null && nextPage !== lastAppendedPageRef.current) {
			lastAppendedPageRef.current = nextPage;
			setPages((prev) => [...prev, nextPage]);
			setHasMore(nextPage.length >= PAGE_SIZE);
			setNextSkip((prev) => prev + nextPage.length);
			setFetchSkip(null);
			isFetchingRef.current = false;
		}
	}, [nextPage, fetchSkip]);

	const allCommits = useMemo(() => pages.flat(), [pages]);

	const handleLoadMore = useCallback(() => {
		if (isFetchingRef.current || !hasMore) return;
		isFetchingRef.current = true;
		setFetchSkip(nextSkip);
	}, [hasMore, nextSkip]);

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

	// Fetch files for expanded commits (reuse existing getCommitFiles)
	const expandedCommitHashes = useMemo(
		() =>
			isActive && historyExpanded
				? Array.from(expandedCommits)
				: ([] as string[]),
		[isActive, historyExpanded, expandedCommits],
	);

	const commitFilesQueries = electronTrpc.useQueries((t) =>
		expandedCommitHashes.map((hash) =>
			t.changes.getCommitFiles({
				worktreePath,
				commitHash: hash,
			}),
		),
	);

	const commitsWithFiles = useMemo(() => {
		const filesMap = new Map<string, ChangedFile[]>();
		expandedCommitHashes.forEach((hash, index) => {
			const query = commitFilesQueries[index];
			if (query?.data) {
				filesMap.set(hash, query.data);
			}
		});
		return allCommits.map((commit) => ({
			...commit,
			files: filesMap.get(commit.hash) || commit.files,
		}));
	}, [allCommits, expandedCommitHashes, commitFilesQueries]);

	const totalCount = allCommits.length;

	return (
		<Collapsible open={historyExpanded} onOpenChange={toggleHistory}>
			<div className="group flex items-center min-w-0">
				<CollapsibleTrigger
					className={cn(
						"flex-1 flex items-center gap-1.5 px-2 py-1.5 text-left min-w-0",
						"hover:bg-accent/30 cursor-pointer transition-colors",
					)}
				>
					<VscChevronRight
						className={cn(
							"size-3 text-muted-foreground shrink-0 transition-transform duration-150",
							historyExpanded && "rotate-90",
						)}
					/>
					<span className="text-xs font-medium truncate">History</span>
					{totalCount > 0 && (
						<span className="text-[10px] text-muted-foreground shrink-0">
							{totalCount}{hasMore ? "+" : ""}
						</span>
					)}
				</CollapsibleTrigger>
			</div>

			<CollapsibleContent className="px-0.5 pb-1 min-w-0 overflow-hidden">
				{isLoading ? (
					<div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
						Loading history...
					</div>
				) : totalCount === 0 ? (
					<div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
						No commits found
					</div>
				) : (
					<CommitListVirtualized
						commits={commitsWithFiles}
						expandedCommits={expandedCommits}
						onCommitToggle={handleCommitToggle}
						selectedFile={selectedFile}
						selectedCommitHash={selectedCommitHash}
						onFileSelect={onCommitFileSelect}
						viewMode={fileListViewMode}
						worktreePath={worktreePath}
						projectId={projectId}
						isExpandedView={isExpandedView}
						onLoadMore={handleLoadMore}
						hasMore={hasMore}
					/>
				)}
			</CollapsibleContent>
		</Collapsible>
	);
}
