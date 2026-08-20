import { ScrollArea } from "@superset/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TRPCClientError } from "@trpc/client";
import { useMemo, useState } from "react";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { resolveProjectFilterParams } from "renderer/routes/_authenticated/_dashboard/components/ProjectFilter/project-filter-utils";
import { WorkItemDetailHeader } from "renderer/routes/_authenticated/_dashboard/components/WorkItemDetailHeader";
import { WorkItemDetailState } from "renderer/routes/_authenticated/_dashboard/components/WorkItemDetailState";
import { useProjectHost } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectHost";
import { PullRequestChecksSection } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestChecksSection";
import { parsePositiveIntegerParam } from "renderer/routes/_authenticated/_dashboard/utils/parsePositiveIntegerParam";
import {
	normalizePRState,
	PRIcon,
} from "renderer/screens/main/components/PRIcon";
import {
	type LinkedPR,
	useNewWorkspaceDraftStore,
} from "renderer/stores/new-workspace-draft";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { Route as PullRequestsLayoutRoute } from "../layout";
import { pullRequestsSearchFromFilters } from "../stores/pullRequestsFilterStore";
import { normalizeAuthorFilter } from "../utils/normalizeAuthorFilter";
import { normalizePullRequestReviewFilter } from "../utils/pullRequestReviewFilter";
import { normalizePullRequestsViewTab } from "../utils/viewerRelationship";
import { PRCodePanel } from "./components/PRCodePanel";
import { PRDetailHeader, type PRDetailTab } from "./components/PRDetailHeader";
import { PRReviewPanel } from "./components/PRReviewPanel";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/pull-requests/$prNumber/",
)({
	component: PullRequestDetailPage,
});

function PullRequestDetailPage() {
	const { prNumber: prNumberRaw } = Route.useParams();
	const prNumber = parsePositiveIntegerParam(prNumberRaw);
	const search = PullRequestsLayoutRoute.useSearch();
	const navigate = useNavigate();
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
	const [activeTab, setActiveTab] = useState<PRDetailTab>("review");

	// `project` identifies this PR's repo, not the list filter: falling back
	// to it would rewrite an "all repositories" view to a single repo on back.
	const backSearch = useMemo(
		() =>
			pullRequestsSearchFromFilters({
				search: search.search ?? "",
				projectFilters: resolveProjectFilterParams(search.projects, null, []),
				authorFilter: normalizeAuthorFilter(search.author),
				reviewFilter: normalizePullRequestReviewFilter(search.review),
				includeClosed: search.state === "all" || search.state === "merged",
				mergedOnly: search.state === "merged",
				viewTab: normalizePullRequestsViewTab(search.tab),
			}),
		[
			search.author,
			search.projects,
			search.review,
			search.search,
			search.state,
			search.tab,
		],
	);

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

	const handleBack = () => {
		navigate({ to: "/pull-requests", search: backSearch });
	};

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
	const header = (
		<WorkItemDetailHeader
			itemNumber={data?.number ?? prNumber}
			icon={<PRIcon state={state} className="size-4 shrink-0" />}
			backLabel="Back to pull requests"
			externalLabel="Open pull request in GitHub"
			url={data?.url ?? null}
			onBack={handleBack}
			onAddToWorkspace={data ? handleAddToWorkspace : null}
		/>
	);

	if (prNumber === null) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				{header}
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
				{header}
				<WorkItemDetailState message="Choose a project from Pull requests before opening a pull request." />
			</div>
		);
	}

	if (!project) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				{header}
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
				{header}
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
				{header}
				<WorkItemDetailState message="Loading pull request…" isLoading />
			</div>
		);
	}

	if (error instanceof Error || !data) {
		// This procedure is new; a host still running an older host-service
		// build resolves the route to nothing and answers NOT_FOUND rather
		// than a domain-level "no such PR" — surfacing that as a raw fetch
		// error just confuses the update path with connectivity issues.
		const isStaleHostService =
			error instanceof TRPCClientError && error.data?.code === "NOT_FOUND";
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				{header}
				<WorkItemDetailState
					message={
						isStaleHostService
							? "This device's Superset is out of date and can't show pull request details yet. Update it, then try again."
							: error instanceof Error
								? error.message
								: "Pull request not found."
					}
					isError
					onRetry={() => void refetch()}
				/>
			</div>
		);
	}

	return (
		<div className="@container flex min-h-0 flex-1 flex-col">
			<PRDetailHeader
				title={data.title}
				state={state}
				authorLogin={data.author}
				prNumber={data.number}
				timestamp={data.updatedAt ?? data.createdAt}
				url={data.url}
				activeTab={activeTab}
				onTabChange={setActiveTab}
				onAddToWorkspace={handleAddToWorkspace}
			/>
			{activeTab === "code" ? (
				// CodeView virtualizes against its own scroll container, so the
				// Code tab sits outside ScrollArea instead of nesting scrollers.
				<div className="min-h-0 flex-1">
					{hostUrl && (
						<PRCodePanel
							hostUrl={hostUrl}
							projectId={projectId}
							prNumber={data.number}
						/>
					)}
				</div>
			) : (
				<ScrollArea className="min-h-0 flex-1">
					{activeTab === "review" && hostUrl && (
						<PRReviewPanel
							hostUrl={hostUrl}
							projectId={projectId}
							prNumber={data.number}
						/>
					)}
					{activeTab === "summary" && (
						<div className="mx-auto w-full max-w-3xl px-4 py-6 @md:px-6 @md:py-8">
							{data.body.trim() ? (
								<MarkdownRenderer content={data.body} />
							) : (
								<p className="text-sm italic text-muted-foreground">
									No description provided.
								</p>
							)}
						</div>
					)}
					{activeTab === "checks" && (
						<div className="mx-auto w-full max-w-3xl px-4 py-6 @md:px-6 @md:py-8">
							<PullRequestChecksSection checks={data.checks} />
						</div>
					)}
				</ScrollArea>
			)}
		</div>
	);
}
