import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { GoIssueClosed, GoIssueOpened } from "react-icons/go";
import { HiOutlineArrowTopRightOnSquare } from "react-icons/hi2";
import { LuMinus, LuPlus, LuRefreshCw } from "react-icons/lu";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	type LinkedIssue,
	useNewWorkspaceDraftStore,
} from "renderer/stores/new-workspace-draft";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";

export interface SelectedIssue {
	issueNumber: number;
	title: string;
	url: string;
	state: string;
}

interface GitHubIssuesContentProps {
	projectFilter: string | null;
	searchQuery: string;
	onCollapse?: () => void;
	onSelectionChange?: (
		issues: SelectedIssue[],
		clearSelection: () => void,
	) => void;
}

const PAGE_SIZE = 30;

export function GitHubIssuesContent({
	projectFilter,
	searchQuery,
	onCollapse,
	onSelectionChange,
}: GitHubIssuesContentProps) {
	const [showClosed, setShowClosed] = useState(false);
	const showClosedId = useId();
	const [selectedIssues, setSelectedIssues] = useState<
		Map<number, SelectedIssue>
	>(new Map());
	const debouncedQuery = useDebouncedValue(searchQuery, 300);
	const hostUrl = useHostUrl(null);
	const navigate = useNavigate();
	const updateDraft = useNewWorkspaceDraftStore((s) => s.updateDraft);
	const resetDraft = useNewWorkspaceDraftStore((s) => s.resetDraft);
	const openModal = useOpenNewWorkspaceModal();

	const {
		data,
		isFetching,
		isFetchingNextPage,
		fetchNextPage,
		hasNextPage,
		error,
		refetch,
	} = useInfiniteQuery({
		queryKey: [
			"tasks",
			"searchGitHubIssues",
			projectFilter,
			hostUrl,
			debouncedQuery.trim(),
			showClosed,
		],
		queryFn: async ({ pageParam }) => {
			if (!hostUrl || !projectFilter) {
				return {
					issues: [],
					totalCount: 0,
					hasNextPage: false,
					page: pageParam,
				};
			}
			const client = getHostServiceClientByUrl(hostUrl);
			return client.workspaceCreation.searchGitHubIssues.query({
				projectId: projectFilter,
				query: debouncedQuery.trim() || undefined,
				limit: PAGE_SIZE,
				includeClosed: showClosed,
				page: pageParam,
			});
		},
		initialPageParam: 1,
		getNextPageParam: (lastPage) =>
			lastPage.hasNextPage ? lastPage.page + 1 : undefined,
		staleTime: 30_000,
		gcTime: 10 * 60_000,
		placeholderData: keepPreviousData,
		enabled: !!projectFilter && !!hostUrl,
		retry: false,
	});

	const issues = useMemo(
		() => data?.pages.flatMap((p) => p.issues) ?? [],
		[data],
	);
	const totalCount = data?.pages[0]?.totalCount ?? 0;
	const repoMismatch = useMemo(() => {
		const first = data?.pages[0];
		return first && "repoMismatch" in first ? first.repoMismatch : null;
	}, [data]);

	const scrollRef = useRef<HTMLDivElement>(null);
	const sentinelRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = sentinelRef.current;
		const root = scrollRef.current;
		if (!el || !root || !hasNextPage || isFetchingNextPage) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) fetchNextPage();
			},
			{ root, rootMargin: "200px" },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	const clearSelection = useCallback(() => {
		setSelectedIssues(new Map());
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: clear selection only when project changes
	useEffect(() => {
		setSelectedIssues(new Map());
	}, [projectFilter]);

	useEffect(() => {
		if (!onSelectionChange) return;
		onSelectionChange(Array.from(selectedIssues.values()), clearSelection);
	}, [selectedIssues, clearSelection, onSelectionChange]);

	const toggleIssueSelection = useCallback(
		(issue: SelectedIssue, checked: boolean) => {
			setSelectedIssues((prev) => {
				const next = new Map(prev);
				if (checked) {
					next.set(issue.issueNumber, issue);
				} else {
					next.delete(issue.issueNumber);
				}
				return next;
			});
		},
		[],
	);

	const handleAddToWorkspace = (issue: (typeof issues)[number]) => {
		if (!projectFilter) return;
		const linkedIssue: LinkedIssue = {
			slug: `gh-${issue.issueNumber}`,
			title: issue.title,
			source: "github",
			url: issue.url,
			number: issue.issueNumber,
			state: issue.state.toLowerCase() === "closed" ? "closed" : "open",
		};
		resetDraft();
		updateDraft({
			selectedProjectId: projectFilter,
			linkedIssues: [linkedIssue],
		});
		openModal(projectFilter);
	};

	const handleOpenUrl = (url: string) => {
		window.open(url, "_blank", "noopener,noreferrer");
	};

	const handleOpenPreview = (issueNumber: number) => {
		if (!projectFilter) return;
		navigate({
			to: "/tasks/issue/$issueNumber",
			params: { issueNumber: String(issueNumber) },
			search: { project: projectFilter },
		});
	};

	if (!projectFilter) {
		return (
			<div className="flex h-full items-center justify-center p-8">
				<div className="flex flex-col items-center gap-2 text-muted-foreground text-center">
					<GoIssueOpened className="h-8 w-8" />
					<span className="text-sm">Select a project to see issues.</span>
				</div>
			</div>
		);
	}

	const isInitialLoad = isFetching && issues.length === 0;
	const countLabel = isInitialLoad
		? "Loading…"
		: totalCount === 0
			? "0"
			: `${issues.length} of ${totalCount}`;

	return (
		<div className="@container flex flex-col h-full overflow-hidden">
			<div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
				<GoIssueOpened className="size-3.5 text-muted-foreground" />
				<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					GitHub issues
				</span>
				<span className="ml-auto text-xs text-muted-foreground tabular-nums">
					{countLabel}
				</span>
				<Button
					variant="ghost"
					size="icon-xs"
					title="Refresh"
					disabled={isFetching}
					onClick={() => refetch()}
				>
					<LuRefreshCw
						className={isFetching ? "size-3.5 animate-spin" : "size-3.5"}
					/>
				</Button>
				{onCollapse && (
					<Button
						variant="ghost"
						size="icon-xs"
						title="Minimize"
						onClick={onCollapse}
					>
						<LuMinus className="size-3.5" />
					</Button>
				)}
			</div>

			<div className="flex items-center gap-2 px-4 py-1.5 border-b text-xs shrink-0">
				<Checkbox
					id={showClosedId}
					checked={showClosed}
					onCheckedChange={(checked) => setShowClosed(checked === true)}
				/>
				<label
					htmlFor={showClosedId}
					className="cursor-pointer select-none text-muted-foreground"
				>
					Show closed
				</label>
				{isFetching && !isInitialLoad && (
					<span className="ml-auto text-muted-foreground">Loading…</span>
				)}
			</div>

			<div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
				{error instanceof Error && (
					<div className="px-4 py-3 text-sm text-destructive select-text cursor-text">
						{error.message}
					</div>
				)}

				{repoMismatch && (
					<div className="px-4 py-3 text-sm text-muted-foreground select-text cursor-text">
						Issue URL must match {repoMismatch}.
					</div>
				)}

				{isInitialLoad ? (
					<div className="flex h-full items-center justify-center gap-2 p-8 text-muted-foreground">
						<LuRefreshCw className="size-4 animate-spin" />
						<span className="text-sm">Loading issues…</span>
					</div>
				) : totalCount === 0 && !isFetching && !error ? (
					<div className="flex h-full items-center justify-center p-8">
						<span className="text-sm text-muted-foreground">
							{showClosed ? "No issues found." : "No open issues."}
						</span>
					</div>
				) : (
					<div className="flex flex-col">
						{issues.map((issue) => {
							const isClosed = issue.state.toLowerCase() === "closed";
							const StateIcon = isClosed ? GoIssueClosed : GoIssueOpened;
							const isSelected = selectedIssues.has(issue.issueNumber);
							return (
								// biome-ignore lint/a11y/useSemanticElements: row contains nested action buttons, so the outer element is a div with role/tabIndex
								<div
									key={issue.issueNumber}
									className="group flex items-center gap-3 px-4 h-9 cursor-pointer border-b border-border/50 hover:bg-accent/50"
									onClick={() => handleOpenPreview(issue.issueNumber)}
									onKeyDown={(e) => {
										if (e.target !== e.currentTarget) return;
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											handleOpenPreview(issue.issueNumber);
										}
									}}
									role="button"
									tabIndex={0}
								>
									<Checkbox
										checked={isSelected}
										onCheckedChange={(checked) =>
											toggleIssueSelection(
												{
													issueNumber: issue.issueNumber,
													title: issue.title,
													url: issue.url,
													state: issue.state,
												},
												checked === true,
											)
										}
										onClick={(e) => e.stopPropagation()}
										aria-label="Select issue"
										className="cursor-pointer shrink-0"
									/>
									<StateIcon
										className={
											isClosed
												? "size-4 shrink-0 text-violet-500"
												: "size-4 shrink-0 text-emerald-500"
										}
									/>
									<span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
										#{issue.issueNumber}
									</span>
									<span className="min-w-0 flex-1 truncate text-sm font-medium">
										{issue.title}
									</span>
									{issue.authorLogin && (
										<span className="hidden shrink-0 text-xs text-muted-foreground @md:inline">
											{issue.authorLogin}
										</span>
									)}
									<div className="flex items-center gap-1">
										<Button
											variant="ghost"
											size="icon-xs"
											title="Open in browser"
											onClick={(e) => {
												e.stopPropagation();
												handleOpenUrl(issue.url);
											}}
										>
											<HiOutlineArrowTopRightOnSquare className="size-3.5" />
										</Button>
										<Button
											variant="outline"
											size="sm"
											title="Add to workspace"
											className="h-7 gap-1.5 px-2 text-xs"
											onClick={(e) => {
												e.stopPropagation();
												handleAddToWorkspace(issue);
											}}
										>
											<LuPlus className="size-3.5" />
											<span className="hidden @lg:inline">
												Add to workspace
											</span>
										</Button>
									</div>
								</div>
							);
						})}
						{hasNextPage && (
							<div
								ref={sentinelRef}
								className="flex items-center justify-center py-3 text-xs text-muted-foreground"
							>
								{isFetchingNextPage ? "Loading more…" : ""}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
