import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	EnterEnabledAlertDialogContent,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { ScrollArea } from "@superset/ui/scroll-area";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
	LuExternalLink,
	LuGitPullRequestClosed,
	LuPlus,
	LuRotateCcw,
} from "react-icons/lu";
import { VscChevronDown, VscGitMerge } from "react-icons/vsc";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { WorkItemDetailState } from "renderer/routes/_authenticated/_dashboard/components/WorkItemDetailState";
import { useProjectHost } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectHost";
import { PullRequestChecksSection } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestChecksSection";
import { PullRequestListToggle } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestListToggle";
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

export const Route = createFileRoute(
	"/_authenticated/_dashboard/pull-requests/$prNumber/",
)({
	component: PullRequestDetailPage,
});

type MergeMethod = "merge" | "squash" | "rebase";
const MERGE_METHOD_LABELS: Record<MergeMethod, string> = {
	squash: "Squash and merge",
	merge: "Create merge commit",
	rebase: "Rebase and merge",
};

type PendingAction = { kind: "close" } | { kind: "merge"; method: MergeMethod };

// Mirrors PRStatusGroup's state-tinted badge language, so a PR reads the
// same way here as it does in the v2 workspace sidebar.
const STATE_BADGE_STYLES: Record<PRState, string> = {
	open: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	merged:
		"border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
	closed: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
	draft: "border-border bg-muted/40 text-muted-foreground",
	queued:
		"border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

function PullRequestDetailPage() {
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
	const updateDraft = useNewWorkspaceDraftStore((state) => state.updateDraft);
	const selectProject = useNewWorkspaceDraftStore(
		(state) => state.selectProject,
	);
	const resetDraft = useNewWorkspaceDraftStore((state) => state.resetDraft);
	const openModal = useOpenNewWorkspaceModal();
	const queryClient = useQueryClient();
	const [pendingAction, setPendingAction] = useState<PendingAction | null>(
		null,
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

	const invalidatePullRequestQueries = () => {
		void queryClient.invalidateQueries({
			queryKey: ["pull-request-detail", projectId, hostUrl, prNumber],
		});
		void queryClient.invalidateQueries({ queryKey: ["pullRequests"] });
	};

	const setPullRequestState = useMutation({
		mutationFn: async (nextState: "open" | "closed") => {
			if (!hostUrl || !projectId || prNumber === null) {
				throw new Error("This project isn't linked to a GitHub repository.");
			}
			const client = getHostServiceClientByUrl(hostUrl);
			return client.pullRequests.setState.mutate({
				projectId,
				prNumber,
				state: nextState,
			});
		},
		onSuccess: invalidatePullRequestQueries,
		onError: (mutationError) => {
			toast.error("Couldn't update pull request", {
				description: mutationError.message,
			});
		},
	});

	const mergePullRequest = useMutation({
		mutationFn: async (mergeMethod: MergeMethod) => {
			if (!hostUrl || !projectId || prNumber === null) {
				throw new Error("This project isn't linked to a GitHub repository.");
			}
			const client = getHostServiceClientByUrl(hostUrl);
			return client.pullRequests.mergePR.mutate({
				projectId,
				prNumber,
				mergeMethod,
			});
		},
		onSuccess: invalidatePullRequestQueries,
		onError: (mutationError) => {
			toast.error("Couldn't merge pull request", {
				description: mutationError.message,
			});
		},
	});

	const isActionPending =
		setPullRequestState.isPending || mergePullRequest.isPending;

	const handleConfirmAction = () => {
		if (!pendingAction) return;
		if (pendingAction.kind === "close") {
			setPullRequestState.mutate("closed");
		} else {
			mergePullRequest.mutate(pendingAction.method);
		}
		setPendingAction(null);
	};

	const handleReopen = () => setPullRequestState.mutate("open");

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
	const canMerge = data?.state === "open" && !data.isDraft;
	// The list pane is always visible in the split view (or reachable via the
	// list-collapse toggle in the shared layout), so there's no "back"
	// affordance here — just the PR identity and its actions.
	const itemNumber = data?.number ?? prNumber;
	const header = (
		<div className="@container flex shrink-0 items-center gap-2 border-b border-border px-4 pb-9 pt-3 @md:gap-3 @md:px-6">
			<PullRequestListToggle />
			<PRIcon state={state} className="size-4 shrink-0" />
			<span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
				{itemNumber === null ? "#—" : `#${itemNumber}`}
			</span>
			{data && (
				<span
					className={cn(
						"shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
						STATE_BADGE_STYLES[state],
					)}
				>
					{data.isDraft ? "Draft" : data.state}
				</span>
			)}
			<div className="min-w-0 flex-1" />
			<div className="ml-auto flex shrink-0 items-center gap-1">
				{data?.url && (
					<Button variant="ghost" size="icon" className="size-8" asChild>
						<a
							href={data.url}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Open pull request in GitHub"
							title="Open pull request in GitHub"
						>
							<LuExternalLink className="size-4" />
						</a>
					</Button>
				)}
				{data && data.state !== "merged" && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								className={cn(
									"h-8 gap-1.5 px-2 @md:px-3",
									canMerge &&
										"border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-400",
								)}
								disabled={isActionPending}
								aria-label="Pull request actions"
							>
								{canMerge ? (
									<VscGitMerge className="size-4" />
								) : data.state === "closed" ? (
									<LuRotateCcw className="size-4" />
								) : (
									<LuGitPullRequestClosed className="size-4" />
								)}
								<span className="hidden @md:inline">
									{data.state === "closed"
										? "Reopen"
										: canMerge
											? "Merge"
											: "Close"}
								</span>
								<VscChevronDown className="size-3" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-56">
							{canMerge && (
								<>
									<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
										Merge
									</DropdownMenuLabel>
									{(["squash", "merge", "rebase"] as const).map((method) => (
										<DropdownMenuItem
											key={method}
											onClick={() =>
												setPendingAction({ kind: "merge", method })
											}
										>
											<VscGitMerge className="size-3.5" />
											{MERGE_METHOD_LABELS[method]}
										</DropdownMenuItem>
									))}
									<DropdownMenuSeparator />
								</>
							)}
							{data.state === "open" && (
								<DropdownMenuItem
									variant="destructive"
									onClick={() => setPendingAction({ kind: "close" })}
								>
									<LuGitPullRequestClosed className="size-3.5" />
									Close pull request
								</DropdownMenuItem>
							)}
							{data.state === "closed" && (
								<DropdownMenuItem onClick={handleReopen}>
									<LuRotateCcw className="size-3.5" />
									Reopen pull request
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				)}
				{data && (
					<Button
						variant="outline"
						size="sm"
						className="h-8 gap-1.5 px-2 @md:px-3"
						onClick={handleAddToWorkspace}
						aria-label="Add to workspace"
						title="Add to workspace"
					>
						<LuPlus className="size-4" />
						<span className="hidden @md:inline">Add to workspace</span>
					</Button>
				)}
			</div>
		</div>
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
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				{header}
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
			{header}
			<AlertDialog
				open={pendingAction !== null}
				onOpenChange={(open) => {
					if (!open) setPendingAction(null);
				}}
			>
				<EnterEnabledAlertDialogContent className="max-w-[360px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pb-2 pt-4">
						<AlertDialogTitle className="font-medium">
							{pendingAction?.kind === "close"
								? `Close #${data.number}?`
								: `Merge #${data.number}?`}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{pendingAction?.kind === "close"
								? `"${data.title}" will be marked closed on GitHub. You can reopen it from here at any time.`
								: `"${data.title}" will be merged into ${data.baseBranch}${
										pendingAction?.kind === "merge"
											? ` via ${MERGE_METHOD_LABELS[pendingAction.method].toLowerCase()}`
											: ""
									}. This can't be undone from here.`}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="flex-row justify-end gap-2 px-4 pb-4 pt-2">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => setPendingAction(null)}
						>
							Cancel
						</Button>
						<AlertDialogAction
							variant={
								pendingAction?.kind === "close" ? "destructive" : "default"
							}
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={handleConfirmAction}
						>
							{pendingAction?.kind === "close"
								? "Close pull request"
								: "Merge pull request"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</EnterEnabledAlertDialogContent>
			</AlertDialog>
			<ScrollArea className="min-h-0 flex-1">
				<div className="grid w-full gap-8 px-4 py-6 @md:px-6 @4xl:grid-cols-[minmax(0,1fr)_20rem] @4xl:py-8">
					<article className="min-w-0">
						<div className="mb-4 flex min-w-0 items-start gap-3">
							<PRIcon state={state} className="mt-1 size-5 shrink-0" />
							<h1 className="min-w-0 break-words text-2xl font-semibold leading-tight text-wrap-pretty">
								{data.title}
							</h1>
						</div>

						<div className="mb-7 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
							<span>{project.name}</span>
							<span aria-hidden>·</span>
							<span className="capitalize">{stateLabel}</span>
							{data.author && (
								<>
									<span aria-hidden>·</span>
									<span className="min-w-0 break-words">by {data.author}</span>
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

						{data.body.trim() ? (
							<MarkdownRenderer content={data.body} />
						) : (
							<p className="text-sm italic text-muted-foreground">
								No description provided.
							</p>
						)}
					</article>

					<aside className="min-w-0 @4xl:sticky @4xl:top-6 @4xl:self-start">
						<PullRequestChecksSection checks={data.checks} />
					</aside>
				</div>
			</ScrollArea>
		</div>
	);
}
