import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Tabs } from "@superset/ui/tabs";
import { cn } from "@superset/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { HiOutlineArrowTopRightOnSquare } from "react-icons/hi2";
import { LuPlus } from "react-icons/lu";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { WorkItemDetailState } from "renderer/routes/_authenticated/_dashboard/components/WorkItemDetailState";
import { useProjectHost } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectHost";
import { parsePositiveIntegerParam } from "renderer/routes/_authenticated/_dashboard/utils/parsePositiveIntegerParam";
import {
	normalizePRState,
	PRIcon,
	type PRState,
} from "renderer/screens/main/components/PRIcon";
import {
	type LinkedPR,
	useNewWorkspaceDraftStore,
} from "renderer/stores/new-workspace-draft";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { Route as PullRequestsLayoutRoute } from "../layout";
import { githubAvatarUrl } from "../utils/githubAvatarUrl";
import {
	PULL_REQUEST_DETAIL_TABS,
	type PullRequestDetailTab,
	PullRequestDetailTabs,
} from "./components/PullRequestDetailTabs";
import { PullRequestTabBar } from "./components/PullRequestTabBar";
import { REVIEW_TAG_STYLES } from "./utils/reviewTagStyles";

interface PullRequestDetailSearch {
	tab?: PullRequestDetailTab;
}

const DEFAULT_TAB: PullRequestDetailTab = "review";

const PR_STATE_BADGE_STYLES: Record<PRState, string> = {
	open: REVIEW_TAG_STYLES.green,
	merged:
		"bg-violet-500/10 text-violet-600 border-violet-500/20 dark:text-violet-400",
	closed: REVIEW_TAG_STYLES.red,
	draft: "bg-muted text-muted-foreground border-transparent",
	queued: REVIEW_TAG_STYLES.amber,
};

// Just the text-color half of PR_STATE_BADGE_STYLES, so the icon inside the
// badge reads as one color with its label instead of PRIcon's own palette.
const PR_BADGE_ICON_COLOR: Record<PRState, string> = {
	open: "text-[#00a558] dark:text-emerald-400",
	merged: "text-violet-600 dark:text-violet-400",
	closed: "text-[#f43b3a] dark:text-red-400",
	draft: "text-muted-foreground",
	queued: "text-[#a15c07] dark:text-amber-400",
};

export const Route = createFileRoute(
	"/_authenticated/_dashboard/pull-requests/$prNumber/",
)({
	component: PullRequestDetailPage,
	validateSearch: (
		search: Record<string, unknown>,
	): PullRequestDetailSearch => ({
		tab: PULL_REQUEST_DETAIL_TABS.includes(search.tab as PullRequestDetailTab)
			? (search.tab as PullRequestDetailTab)
			: undefined,
	}),
});

function PullRequestDetailPage() {
	const { prNumber: prNumberRaw } = Route.useParams();
	const prNumber = parsePositiveIntegerParam(prNumberRaw);
	const search = PullRequestsLayoutRoute.useSearch();
	const { tab } = Route.useSearch();
	const routeNavigate = Route.useNavigate();
	const projectId = search.project ?? null;
	const {
		hostId,
		isReady: areProjectsReady,
		project,
	} = useProjectHost(projectId);
	const hostUrl = useHostUrl(hostId ?? undefined);
	const updateDraft = useNewWorkspaceDraftStore((state) => state.updateDraft);
	const selectProject = useNewWorkspaceDraftStore(
		(state) => state.selectProject,
	);
	const resetDraft = useNewWorkspaceDraftStore((state) => state.resetDraft);
	const openModal = useOpenNewWorkspaceModal();

	const activeTab = tab ?? DEFAULT_TAB;
	const handleTabChange = (nextTab: PullRequestDetailTab) => {
		routeNavigate({
			search: (prev) => ({
				...prev,
				tab: nextTab === DEFAULT_TAB ? undefined : nextTab,
			}),
			replace: true,
		});
	};

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["pull-request-detail", projectId, hostUrl, prNumber],
		queryFn: async () => {
			if (!hostUrl || !projectId || prNumber === null) return null;
			const client = getHostServiceClientByUrl(hostUrl);
			return client.pullRequests.getContent.query({
				projectId,
				prNumber,
			});
		},
		enabled: !!hostUrl && !!project && !!projectId && prNumber !== null,
		staleTime: 30_000,
		gcTime: 10 * 60_000,
	});

	const handleAddToWorkspace = () => {
		if (!projectId || !hostId || !data) return;
		const linkedPR: LinkedPR = {
			prNumber: data.number,
			title: data.title,
			url: data.url,
			state: normalizePRState(data.state, data.isDraft),
		};
		resetDraft();
		selectProject(projectId);
		updateDraft({ hostId, linkedPR });
		openModal(projectId);
	};

	const defaultState = normalizePRState("open", false);
	const state = data
		? normalizePRState(data.state, data.isDraft)
		: defaultState;

	if (prNumber === null) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<WorkItemDetailState
					message="This pull request link is invalid."
					isError
				/>
			</div>
		);
	}

	if (!projectId) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<WorkItemDetailState message="Choose a project from Pull requests before opening a pull request." />
			</div>
		);
	}

	if (!project) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<WorkItemDetailState
					message={
						areProjectsReady
							? "This project is no longer available on your devices."
							: "Loading project…"
					}
					isLoading={!areProjectsReady}
					isError={areProjectsReady}
				/>
			</div>
		);
	}

	if (!hostId || !hostUrl) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<WorkItemDetailState
					message="The device that hosts this project is unavailable."
					isError
				/>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<WorkItemDetailState message="Loading pull request…" isLoading />
			</div>
		);
	}

	if (error instanceof Error || !data) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<WorkItemDetailState
					message={
						error instanceof Error ? error.message : "Pull request not found."
					}
					isError
					onRetry={() => void refetch()}
				/>
			</div>
		);
	}

	const stateLabel = data.isDraft ? "Draft" : data.state;
	const branchSummary = data.branch
		? `${data.headRepositoryOwner && data.isCrossRepository ? `${data.headRepositoryOwner}:${data.branch}` : data.branch} → ${data.baseBranch}`
		: null;

	return (
		<div className="@container flex min-h-0 flex-1 flex-col">
			<Tabs
				value={activeTab}
				onValueChange={(value) =>
					handleTabChange(value as PullRequestDetailTab)
				}
				className="flex min-h-0 flex-1 flex-col gap-0"
			>
				<div className="w-full px-4 pt-6 @md:px-6">
					<div className="mb-4">
						<PullRequestTabBar />
					</div>

					<div className="mb-3 flex min-w-0 items-start gap-3">
						<h1 className="min-w-0 flex-1 break-words text-2xl font-semibold leading-tight text-wrap-pretty">
							{data.title}
						</h1>
						<div className="flex shrink-0 items-center gap-1">
							<Button
								variant="ghost"
								size="icon-xs"
								title="Open in browser"
								aria-label="Open pull request in GitHub"
								onClick={() =>
									window.open(data.url, "_blank", "noopener,noreferrer")
								}
							>
								<HiOutlineArrowTopRightOnSquare className="size-3.5" />
							</Button>
							<Button
								variant="outline"
								size="sm"
								title="Add to workspace"
								aria-label="Add pull request to workspace"
								className="h-7 gap-1.5 px-2 text-xs"
								onClick={handleAddToWorkspace}
							>
								<LuPlus className="size-3.5" />
								Add to workspace
							</Button>
						</div>
					</div>

					<div className="mb-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
						<Badge
							variant="outline"
							className={cn(
								"gap-1 rounded-full border-0 font-medium capitalize",
								PR_STATE_BADGE_STYLES[state],
							)}
						>
							<PRIcon
								state={state}
								className={cn("size-3.5 shrink-0", PR_BADGE_ICON_COLOR[state])}
							/>
							{stateLabel}
						</Badge>
						{data.author && (
							<span className="flex min-w-0 items-center gap-1.5">
								<img
									alt=""
									src={githubAvatarUrl(data.author)}
									className="size-4 shrink-0 rounded"
								/>
								<span className="min-w-0 break-words">{data.author}</span>
							</span>
						)}
						<span aria-hidden>·</span>
						<span>#{data.number}</span>
						{data.createdAt && (
							<>
								<span aria-hidden>·</span>
								<span>
									{formatRelativeTime(new Date(data.createdAt).getTime())} ago
								</span>
							</>
						)}
						{branchSummary && (
							<>
								<span aria-hidden>·</span>
								<span className="min-w-0 break-all font-mono">
									{branchSummary}
								</span>
							</>
						)}
					</div>
				</div>

				<PullRequestDetailTabs
					projectId={projectId}
					prNumber={prNumber}
					prUrl={data.url}
					hostUrl={hostUrl}
					body={data.body}
					checks={data.checks}
				/>
			</Tabs>
		</div>
	);
}
