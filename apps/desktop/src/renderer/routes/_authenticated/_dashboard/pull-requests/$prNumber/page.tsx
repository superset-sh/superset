import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { WindowControlsInset } from "renderer/routes/_authenticated/_dashboard/components/WindowControlsInset";
import { WorkItemDetailState } from "renderer/routes/_authenticated/_dashboard/components/WorkItemDetailState";
import { useProjectHost } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectHost";
import { PullRequestDetailHeader } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestDetailHeader";
import { PullRequestListToggle } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestListToggle";
import { PullRequestSummaryContent } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestSummaryContent";
import { usePullRequestDetail } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestDetail";
import { resolvePullRequestDetail } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/resolvePullRequestDetail";
import { parsePositiveIntegerParam } from "renderer/routes/_authenticated/_dashboard/utils/parsePositiveIntegerParam";
import { Route as PullRequestsLayoutRoute } from "../layout";
import { PullRequestCodeTab } from "./components/PullRequestCodeTab";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/pull-requests/$prNumber/",
)({
	component: PullRequestDetailPage,
});

type DetailTab = "summary" | "code";

function PullRequestDetailPage() {
	const { t } = useLingui();
	const detailTabs: ReadonlyArray<{ value: DetailTab; label: string }> = [
		{
			value: "summary",
			label: t({
				message: "Summary",
			}),
		},
		{
			value: "code",
			label: t({
				message: "Code",
			}),
		},
	];
	const { prNumber: prNumberRaw } = Route.useParams();
	const prNumber = parsePositiveIntegerParam(prNumberRaw);
	const search = PullRequestsLayoutRoute.useSearch();
	const projectId = search.project ?? null;
	const {
		hostId,
		isReady: areProjectsReady,
		project,
	} = useProjectHost(projectId);
	const hostUrl = useHostUrl(hostId ?? undefined);
	const [activeTab, setActiveTab] = useState<DetailTab>("summary");

	const { data, isLoading, error, refetch } = usePullRequestDetail({
		projectId,
		hostUrl,
		prNumber,
		enabled: !!project,
	});

	// The list pane is always visible in the split view (or reachable via the
	// list-collapse toggle in the shared layout), so there's no "back"
	// affordance here — just the PR identity and its actions.
	const header = (
		<div className="flex shrink-0 flex-col border-b border-border">
			<div className="flex h-10 shrink-0 items-center gap-1 px-4">
				<PullRequestListToggle />
				<div className="ml-2 flex items-center gap-1">
					{detailTabs.map(({ value, label }) => (
						<button
							key={value}
							type="button"
							onClick={() => setActiveTab(value)}
							aria-current={activeTab === value ? "true" : undefined}
							className={cn(
								"rounded-md px-2 py-1 text-xs font-medium transition-colors",
								activeTab === value
									? "bg-accent text-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{label}
						</button>
					))}
				</div>
				{/* Window-drag leaf standing in for the hidden TopBar. */}
				<div className="drag h-full min-w-0 flex-1" />
				{/* Share and the "..." overflow (close/reopen) are coming soon —
				    both hidden until they have real functionality wired up. */}
				<WindowControlsInset />
			</div>
			<PullRequestDetailHeader
				projectId={projectId}
				hostId={hostId}
				hostUrl={hostUrl}
				prNumber={prNumber}
				data={data}
				isLoading={isLoading}
			/>
		</div>
	);

	const resolved = resolvePullRequestDetail({
		prNumber,
		projectId,
		areProjectsReady,
		hasProject: !!project,
		hostUrl,
		isLoading,
		error,
		data,
		refetch: () => void refetch(),
	});

	if (resolved.status === "fallback") {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				{header}
				<WorkItemDetailState
					message={resolved.message}
					isLoading={resolved.isLoading}
					isError={resolved.isError}
					onRetry={resolved.onRetry}
				/>
			</div>
		);
	}

	return (
		<div className="@container flex min-h-0 flex-1 flex-col">
			{header}
			{/* Kept mounted (hidden via CSS, not unmounted) so Radix's
			 *  ScrollArea instance survives a tab switch and away — swapping
			 *  it out of a ternary would reset scrollTop every time the
			 *  reviewer comes back from the Code tab. The Code tab itself
			 *  still mounts/unmounts with the ternary below: it isn't a
			 *  simple scroll container (its own virtualized diff viewer
			 *  manages scrolling internally), and keeping its polling/agent
			 *  subscriptions alive while hidden isn't worth the tradeoff. */}
			<div
				className={cn("min-h-0 flex-1", activeTab !== "summary" && "hidden")}
			>
				<PullRequestSummaryContent data={resolved.data} />
			</div>
			{activeTab === "code" && (
				<PullRequestCodeTab
					projectId={resolved.projectId}
					prNumber={resolved.data.number}
					prUrl={resolved.data.url}
					hostUrl={resolved.hostUrl}
					hostId={hostId}
				/>
			)}
		</div>
	);
}
