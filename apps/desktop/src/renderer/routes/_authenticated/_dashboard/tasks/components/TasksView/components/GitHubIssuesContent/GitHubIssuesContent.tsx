import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { GoIssueClosed, GoIssueOpened } from "react-icons/go";
import { HiOutlineArrowTopRightOnSquare } from "react-icons/hi2";
import { LuMinus, LuPlus, LuRefreshCw } from "react-icons/lu";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { useOpenNewWorkspace } from "renderer/hooks/useOpenNewWorkspace";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { LoadMoreSentinel } from "renderer/routes/_authenticated/_dashboard/components/LoadMoreSentinel";
import { serializeProjectFilters } from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter/project-filter-utils";
import type { ProjectQueryTarget } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";
import { useWorkItemsList } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkItemsList";
import { linkedIssueFromGitLab } from "renderer/routes/_authenticated/utils/linkedIssueFromGitLab";
import type { GitLabIssueReference } from "renderer/stores/new-workspace-draft";
import {
	type LinkedIssue,
	useNewWorkspaceDraftStore,
} from "renderer/stores/new-workspace-draft";

export interface SelectedIssue {
	gitlab?: GitLabIssueReference;
	issueNumber: number;
	title: string;
	url: string;
	state: string;
	projectId: string;
}

import type { IssueSearchSelection } from "../../hooks/useIssueSearchSelection/useIssueSearchSelection";

interface GitHubIssuesContentProps {
	issueSelection?: IssueSearchSelection;
	projectFilters: string[];
	projectTargets: ProjectQueryTarget[];
	areProjectsReady: boolean;
	hasProjects: boolean;
	searchQuery: string;
	includeClosed: boolean;
	onCollapse?: () => void;
	onSelectionChange?: (
		issues: SelectedIssue[],
		clearSelection: () => void,
	) => void;
}

const PAGE_SIZE = 30;

function isNativeIssueUrl(url: string) {
	return (
		url.includes("/-/issues/") &&
		!/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/[1-9]\d*$/.test(url)
	);
}

export function GitHubIssuesContent({
	issueSelection,
	projectFilters,
	projectTargets,
	areProjectsReady,
	hasProjects,
	searchQuery,
	includeClosed,
	onCollapse,
	onSelectionChange,
}: GitHubIssuesContentProps) {
	const { t } = useLingui();
	const [selectedIssues, setSelectedIssues] = useState<
		Map<string, SelectedIssue>
	>(new Map());
	const debouncedQuery = useDebouncedValue(searchQuery, 300);
	const navigate = useNavigate();
	const updateDraft = useNewWorkspaceDraftStore((s) => s.updateDraft);
	const selectProject = useNewWorkspaceDraftStore((s) => s.selectProject);
	const resetDraft = useNewWorkspaceDraftStore((s) => s.resetDraft);
	const openNewWorkspace = useOpenNewWorkspace();

	const {
		rows: issues,
		totalCount,
		repoMismatch,
		isFetching,
		isFetchingNextPage,
		hasNextPage,
		error,
		refetch,
		scrollRef,
		sentinelRef,
	} = useWorkItemsList({
		projectTargets,
		resetKey: `${debouncedQuery.trim()}\0${includeClosed}`,
		getQueryOptions: ({ target, page }) => ({
			queryKey: [
				"tasks",
				"searchGitHubIssues",
				target.key,
				target.hostUrl,
				debouncedQuery.trim(),
				includeClosed,
				page,
			],
			queryFn: async () => {
				const firstProject = target.projects[0];
				if (!target.hostUrl || !firstProject) return null;
				const client = getHostServiceClientByUrl(target.hostUrl);
				return client.workspaceCreation.searchGitHubIssues.query({
					projectId: firstProject.projectId,
					projectIds: target.projects.map((project) => project.projectId),
					query: debouncedQuery.trim() || undefined,
					limit: PAGE_SIZE,
					includeClosed,
					page,
				});
			},
			enabled: !!target.hostUrl,
			staleTime: 30_000,
			gcTime: 10 * 60_000,
		}),
		getRows: (data) => data.issues,
		getRowKey: (issue) =>
			isNativeIssueUrl(issue.url)
				? JSON.stringify([
						"hostId" in issue ? issue.hostId : null,
						issue.projectId,
						issue.url,
					])
				: `${issue.projectId}:${issue.issueNumber}`,
	});

	const clearSelection = useCallback(() => {
		setSelectedIssues(new Map());
	}, []);

	// Key off content, not array identity: URL re-renders rebuild the array
	// and would wipe the selection on unrelated navigations.
	const projectFiltersKey = projectFilters.join("\0");
	// biome-ignore lint/correctness/useExhaustiveDependencies: clear selection only when the selected repositories change
	useEffect(() => {
		setSelectedIssues(new Map());
	}, [projectFiltersKey]);

	useEffect(() => {
		if (!onSelectionChange) return;
		onSelectionChange(Array.from(selectedIssues.values()), clearSelection);
	}, [selectedIssues, clearSelection, onSelectionChange]);

	const toggleIssueSelection = useCallback(
		(issue: SelectedIssue, checked: boolean) => {
			setSelectedIssues((prev) => {
				const next = new Map(prev);
				const key = issue.gitlab
					? `gitlab:${JSON.stringify([issue.gitlab.hostId, issue.projectId, issue.gitlab.expectedIssueUrl])}`
					: `${issue.projectId}:${issue.issueNumber}`;
				if (checked) {
					next.set(key, issue);
				} else {
					next.delete(key);
				}
				return next;
			});
		},
		[],
	);

	const nativeIssue = (issue: (typeof issues)[number]) =>
		issue.hostId && issue.hostUrl
			? linkedIssueFromGitLab({
					...issue,
					hostId: issue.hostId,
					hostUrl: issue.hostUrl,
				})
			: null;
	const refuseNativeIssue = () =>
		toast.error(t({ message: "GitLab issue content could not be verified" }));
	const handleIssueChecked = (
		issue: (typeof issues)[number],
		checked: boolean,
	) => {
		if (isNativeIssueUrl(issue.url)) {
			const linked = nativeIssue(issue);
			if (!linked?.gitlab) {
				refuseNativeIssue();
				return;
			}
			toggleIssueSelection(
				{
					issueNumber: issue.issueNumber,
					title: issue.title,
					url: issue.url,
					state: issue.state,
					projectId: issue.projectId,
					gitlab: linked.gitlab,
				},
				checked,
			);
			return;
		}
		toggleIssueSelection(
			{
				issueNumber: issue.issueNumber,
				title: issue.title,
				url: issue.url,
				state: issue.state,
				projectId: issue.projectId,
			},
			checked,
		);
	};

	const handleAddToWorkspace = (issue: (typeof issues)[number]) => {
		if (isNativeIssueUrl(issue.url)) {
			const linked = nativeIssue(issue);
			if (!linked) {
				refuseNativeIssue();
				return;
			}
			resetDraft();
			selectProject(issue.projectId);
			updateDraft({ hostId: issue.hostId, linkedIssues: [linked] });
			openNewWorkspace(issue.projectId);
			return;
		}
		const linkedIssue: LinkedIssue = {
			slug: `gh-${issue.issueNumber}`,
			title: issue.title,
			source: "github",
			url: issue.url,
			number: issue.issueNumber,
			state: issue.state.toLowerCase() === "closed" ? "closed" : "open",
		};
		resetDraft();
		selectProject(issue.projectId);
		updateDraft({ hostId: issue.hostId, linkedIssues: [linkedIssue] });
		openNewWorkspace(issue.projectId);
	};

	const handleOpenUrl = (url: string) => {
		window.open(url, "_blank", "noopener,noreferrer");
	};

	const handleOpenPreview = (issue: (typeof issues)[number]) => {
		if (isNativeIssueUrl(issue.url)) {
			const linked = nativeIssue(issue);
			if (!linked) {
				refuseNativeIssue();
				return;
			}
			navigate({
				to: "/tasks/issue/$issueNumber",
				params: { issueNumber: String(issue.issueNumber) },
				search: {
					search: searchQuery || undefined,
					type: "issues",
					project: issue.projectId,
					projects: serializeProjectFilters(projectFilters),
					state: includeClosed ? "all" : undefined,
					issueUrl: linked.url,
				},
			});
			return;
		}
		navigate({
			to: "/tasks/issue/$issueNumber",
			params: { issueNumber: String(issue.issueNumber) },
			search: {
				search: searchQuery || undefined,
				type: "issues",
				project: issue.projectId,
				projects: serializeProjectFilters(projectFilters),
				state: includeClosed ? "all" : undefined,
			},
		});
	};

	if (projectTargets.length === 0) {
		return (
			<div className="flex h-full items-center justify-center p-8">
				<div className="flex flex-col items-center gap-2 text-muted-foreground text-center">
					<GoIssueOpened className="h-8 w-8" />
					<span className="max-w-prose text-sm text-wrap-pretty">
						{areProjectsReady ? (
							hasProjects ? (
								!issueSelection || issueSelection.mode === "github" ? (
									<Trans>Select a project to see GitHub issues.</Trans>
								) : (
									<Trans>Select a project to see repository issues.</Trans>
								)
							) : !issueSelection || issueSelection.mode === "github" ? (
								<Trans>Add a project to see GitHub issues.</Trans>
							) : (
								<Trans>Add a project to see repository issues.</Trans>
							)
						) : (
							<Trans>Loading projects…</Trans>
						)}
					</span>
				</div>
			</div>
		);
	}

	if (projectTargets.every((target) => !target.hostUrl)) {
		return (
			<div className="flex h-full items-center justify-center p-8">
				<div className="flex max-w-prose flex-col items-center gap-2 text-center text-muted-foreground">
					<GoIssueOpened className="size-8" />
					<span className="text-sm text-wrap-pretty">
						<Trans>The device that hosts this project is unavailable.</Trans>
					</span>
				</div>
			</div>
		);
	}

	const isInitialLoad =
		(isFetching || issueSelection?.pending) && issues.length === 0;
	const issueMode = issueSelection?.mode ?? "github";
	const hasNativeIssues = issueMode !== "github";
	const refresh = () => {
		issueSelection?.refetch?.();
		refetch();
	};

	return (
		<div
			className="@container flex h-full flex-col overflow-hidden"
			aria-busy={isFetching}
		>
			<div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
				<GoIssueOpened className="size-3.5 text-muted-foreground" />
				<span className="text-xs text-muted-foreground" aria-live="polite">
					<span className="tabular-nums">
						{isInitialLoad ? (
							<Trans>Loading…</Trans>
						) : totalCount === 0 ? (
							"0"
						) : (
							<Trans>
								{issues.length} of {totalCount}
							</Trans>
						)}
					</span>{" "}
					{issueMode === "gitlab" ? (
						<Plural
							value={totalCount}
							one="GitLab issue"
							other="GitLab issues"
						/>
					) : hasNativeIssues ? (
						<Plural value={totalCount} one="issue" other="issues" />
					) : (
						<Plural
							value={totalCount}
							one="GitHub issue"
							other="GitHub issues"
						/>
					)}
				</span>
				<Button
					variant="ghost"
					size="icon-xs"
					className="ml-auto"
					title={t({
						message: "Refresh",
					})}
					aria-label={
						hasNativeIssues
							? t({ message: "Refresh issues" })
							: t({ message: "Refresh GitHub issues" })
					}
					disabled={isFetching}
					onClick={refresh}
				>
					<LuRefreshCw
						className={
							isFetching
								? "size-3.5 animate-spin motion-reduce:animate-none"
								: "size-3.5"
						}
					/>
				</Button>
				{onCollapse && (
					<Button
						variant="ghost"
						size="icon-xs"
						title={t({
							message: "Minimize",
						})}
						aria-label={
							hasNativeIssues
								? t({ message: "Minimize issues" })
								: t({ message: "Minimize GitHub issues" })
						}
						onClick={onCollapse}
					>
						<LuMinus className="size-3.5" />
					</Button>
				)}
			</div>

			<div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
				{issueSelection?.pending && (
					<output className="px-4 py-2 text-xs text-muted-foreground">
						<Trans>Loading repositories…</Trans>
					</output>
				)}
				{issueSelection?.error && (
					<div
						role="alert"
						className="flex items-center gap-2 px-4 py-2 text-xs text-destructive"
					>
						<span>{issueSelection.error}</span>
						<Button
							variant="outline"
							size="xs"
							data-issue-identity-retry
							onClick={() => issueSelection.refetch?.()}
						>
							<Trans>Retry</Trans>
						</Button>
					</div>
				)}
				{issueSelection?.error &&
				issues.length === 0 &&
				!(error instanceof Error) ? null : error instanceof Error &&
					issues.length === 0 ? (
					<div className="flex flex-col items-start gap-3 px-4 py-4 text-sm text-destructive select-text cursor-text">
						<span>{error.message}</span>
						<Button variant="outline" size="sm" onClick={refresh}>
							<Trans>Try again</Trans>
						</Button>
					</div>
				) : repoMismatch ? (
					<div className="px-4 py-3 text-sm text-muted-foreground select-text cursor-text">
						<Trans>Issue URL must match {repoMismatch}.</Trans>
					</div>
				) : isInitialLoad ? (
					<div className="flex h-full items-center justify-center gap-2 p-8 text-muted-foreground">
						<LuRefreshCw className="size-4 animate-spin motion-reduce:animate-none" />
						<span className="text-sm">
							<Trans>Loading issues…</Trans>
						</span>
					</div>
				) : totalCount === 0 && !isFetching ? (
					<div className="flex h-full items-center justify-center p-8">
						<span className="text-sm text-muted-foreground">
							{includeClosed ? (
								<Trans>No issues found.</Trans>
							) : (
								<Trans>No open issues.</Trans>
							)}
						</span>
					</div>
				) : (
					<div className="flex flex-col">
						{error instanceof Error && (
							<div className="flex items-center gap-2 border-b border-border/50 bg-destructive/5 px-4 py-2 text-xs text-destructive">
								<span className="min-w-0 flex-1 truncate select-text cursor-text">
									<Trans>
										Some repositories could not be loaded: {error.message}
									</Trans>
								</span>
								<Button variant="outline" size="xs" onClick={refresh}>
									<Trans>Retry</Trans>
								</Button>
							</div>
						)}
						{issues.map((issue) => {
							const isClosed = issue.state.toLowerCase() === "closed";
							const StateIcon = isClosed ? GoIssueClosed : GoIssueOpened;
							const selectionKey = isNativeIssueUrl(issue.url)
								? (nativeIssue(issue)?.slug ??
									`${issue.projectId}:${issue.issueNumber}`)
								: `${issue.projectId}:${issue.issueNumber}`;
							const isSelected = selectedIssues.has(selectionKey);
							return (
								// biome-ignore lint/a11y/useSemanticElements: row contains nested action buttons, so the outer element is a div with role/tabIndex
								<div
									key={selectionKey}
									className="group flex h-9 cursor-pointer items-center gap-3 border-b border-border/50 px-4 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
									onClick={() => handleOpenPreview(issue)}
									onKeyDown={(e) => {
										if (e.target !== e.currentTarget) return;
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											handleOpenPreview(issue);
										}
									}}
									role="button"
									tabIndex={0}
								>
									<Checkbox
										checked={isSelected}
										onCheckedChange={(checked) =>
											handleIssueChecked(issue, checked === true)
										}
										onClick={(e) => e.stopPropagation()}
										aria-label={t({
											message: "Select issue",
										})}
										className="cursor-pointer shrink-0"
									/>
									<StateIcon
										className={
											isClosed
												? "size-4 shrink-0 text-violet-500"
												: "size-4 shrink-0 text-emerald-500"
										}
									/>
									{projectTargets.length > 1 && (
										<span className="hidden max-w-28 shrink-0 truncate text-xs text-muted-foreground @lg:inline">
											{issue.projectName}
										</span>
									)}
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
											title={t({
												message: "Open in browser",
											})}
											aria-label={t({
												message: `Open issue #${issue.issueNumber} in browser`,
											})}
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
											title={t({
												message: "Add to workspace",
											})}
											aria-label={t({
												message: `Add issue #${issue.issueNumber} to workspace`,
											})}
											className="h-7 gap-1.5 px-2 text-xs"
											onClick={(e) => {
												e.stopPropagation();
												handleAddToWorkspace(issue);
											}}
										>
											<LuPlus className="size-3.5" />
											<span className="hidden @lg:inline">
												<Trans>Add to workspace</Trans>
											</span>
										</Button>
									</div>
								</div>
							);
						})}
						<LoadMoreSentinel
							sentinelRef={sentinelRef}
							hasNextPage={hasNextPage}
							isFetchingNextPage={isFetchingNextPage}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
