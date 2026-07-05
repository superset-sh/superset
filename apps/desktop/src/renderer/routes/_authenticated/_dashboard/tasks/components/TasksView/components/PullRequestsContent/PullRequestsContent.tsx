import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { GoGitPullRequest } from "react-icons/go";
import { HiOutlineArrowTopRightOnSquare } from "react-icons/hi2";
import { LuMinus, LuPlus, LuRefreshCw } from "react-icons/lu";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	normalizePRState,
	PRIcon,
} from "renderer/screens/main/components/PRIcon";
import {
	type LinkedPR,
	useNewWorkspaceDraftStore,
} from "renderer/stores/new-workspace-draft";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";

interface PullRequestsContentProps {
	projectFilter: string | null;
	searchQuery: string;
	onCollapse?: () => void;
}

const PAGE_SIZE = 30;

export function PullRequestsContent({
	projectFilter,
	searchQuery,
	onCollapse,
}: PullRequestsContentProps) {
	const [showClosed, setShowClosed] = useState(false);
	const showClosedId = useId();
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
			"searchPullRequests",
			projectFilter,
			hostUrl,
			debouncedQuery.trim(),
			showClosed,
		],
		queryFn: async ({ pageParam }) => {
			if (!hostUrl || !projectFilter) {
				return {
					pullRequests: [],
					totalCount: 0,
					hasNextPage: false,
					page: pageParam,
				};
			}
			const client = getHostServiceClientByUrl(hostUrl);
			return client.workspaceCreation.searchPullRequests.query({
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

	const pullRequests = useMemo(
		() => data?.pages.flatMap((p) => p.pullRequests) ?? [],
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

	const handleAddToWorkspace = (pr: (typeof pullRequests)[number]) => {
		if (!projectFilter) return;
		const linkedPR: LinkedPR = {
			prNumber: pr.prNumber,
			title: pr.title,
			url: pr.url,
			state: normalizePRState(pr.state, pr.isDraft),
		};
		resetDraft();
		updateDraft({ selectedProjectId: projectFilter, linkedPR });
		openModal(projectFilter);
	};

	const handleOpenUrl = (url: string) => {
		window.open(url, "_blank", "noopener,noreferrer");
	};

	const handleOpenPreview = (prNumber: number) => {
		if (!projectFilter) return;
		navigate({
			to: "/tasks/pr/$prNumber",
			params: { prNumber: String(prNumber) },
			search: { project: projectFilter },
		});
	};

	if (!projectFilter) {
		return (
			<div className="flex h-full items-center justify-center p-8">
				<div className="flex flex-col items-center gap-2 text-muted-foreground text-center">
					<GoGitPullRequest className="h-8 w-8" />
					<span className="text-sm">
						Select a project to see pull requests.
					</span>
				</div>
			</div>
		);
	}

	const isInitialLoad = isFetching && pullRequests.length === 0;
	const countLabel = isInitialLoad
		? "Loading…"
		: totalCount === 0
			? "0"
			: `${pullRequests.length} of ${totalCount}`;

	return (
		<div className="@container flex flex-col h-full overflow-hidden">
			<div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
				<GoGitPullRequest className="size-3.5 text-muted-foreground" />
				<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Pull requests
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
					Show closed / merged
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
						PR URL must match {repoMismatch}.
					</div>
				)}

				{isInitialLoad ? (
					<div className="flex h-full items-center justify-center gap-2 p-8 text-muted-foreground">
						<LuRefreshCw className="size-4 animate-spin" />
						<span className="text-sm">Loading pull requests…</span>
					</div>
				) : totalCount === 0 && !isFetching && !error ? (
					<div className="flex h-full items-center justify-center p-8">
						<span className="text-sm text-muted-foreground">
							{showClosed
								? "No pull requests found."
								: "No open pull requests."}
						</span>
					</div>
				) : (
					<div className="flex flex-col">
						{pullRequests.map((pr) => {
							const state = normalizePRState(pr.state, pr.isDraft);
							return (
								// biome-ignore lint/a11y/useSemanticElements: row contains nested action buttons, so the outer element is a div with role/tabIndex
								<div
									key={pr.prNumber}
									className="group flex items-center gap-3 px-4 h-9 cursor-pointer border-b border-border/50 hover:bg-accent/50"
									onClick={() => handleOpenPreview(pr.prNumber)}
									onKeyDown={(e) => {
										if (e.target !== e.currentTarget) return;
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											handleOpenPreview(pr.prNumber);
										}
									}}
									role="button"
									tabIndex={0}
								>
									<PRIcon state={state} className="size-4 shrink-0" />
									<span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
										#{pr.prNumber}
									</span>
									<span className="min-w-0 flex-1 truncate text-sm font-medium">
										{pr.title}
									</span>
									{pr.authorLogin && (
										<span className="hidden shrink-0 text-xs text-muted-foreground @md:inline">
											{pr.authorLogin}
										</span>
									)}
									<div className="flex items-center gap-1">
										<Button
											variant="ghost"
											size="icon-xs"
											title="Open in browser"
											onClick={(e) => {
												e.stopPropagation();
												handleOpenUrl(pr.url);
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
												handleAddToWorkspace(pr);
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
