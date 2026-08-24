import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	EnterEnabledAlertDialogContent,
} from "@superset/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
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
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { LuChevronRight } from "react-icons/lu";
import { VscChevronDown, VscGitMerge } from "react-icons/vsc";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
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
	merge: "Merge commit",
	rebase: "Rebase and merge",
};
const MERGE_METHOD_DESCRIPTIONS: Record<MergeMethod, string> = {
	squash: "Combine all commits",
	merge: "Preserve commit history",
	rebase: "Reapply all commits",
};

type PendingAction =
	| { kind: "close" }
	| { kind: "merge"; method: MergeMethod; force?: boolean };

type DetailTab = "summary" | "code";
const DETAIL_TABS: ReadonlyArray<{ value: DetailTab; label: string }> = [
	{ value: "summary", label: "Summary" },
	{ value: "code", label: "Code" },
];

// Borderless, flat-tinted pill per Figma (PR Badge, node 3246:2410) — exact
// hex for "open" (#dcfae8 / #00a558); the other states follow the same
// pale-bg/saturated-text formula since Figma only specs the open variant.
// Dark values are hand-tuned (no Figma source), reviewed against the app's
// real --background/--card/--muted surfaces.
//
// `dark:` is intentionally NOT used here: this app's globals.css never
// defines `@custom-variant dark`, so Tailwind's `dark:` falls back to
// `prefers-color-scheme` — it tracks the OS setting, not this app's own
// theme switcher, and silently never fires when they disagree. `[.dark_&]`
// targets the real `.dark` class the theme store puts on <html>.
const STATE_BADGE_STYLES: Record<PRState, string> = {
	open: "bg-[#dcfae8] text-[#00a558] [.dark_&]:bg-[#064e3b] [.dark_&]:text-[#34d399]",
	closed:
		"bg-rose-100 text-rose-600 [.dark_&]:bg-[#4a2020] [.dark_&]:text-[#e0918a]",
	merged:
		"bg-violet-100 text-violet-600 [.dark_&]:bg-[#322b47] [.dark_&]:text-[#b0a6d9]",
	draft: "bg-muted text-muted-foreground",
	queued:
		"bg-amber-100 text-amber-600 [.dark_&]:bg-[#78350f] [.dark_&]:text-[#fbbf24]",
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
	const [activeTab, setActiveTab] = useState<DetailTab>("summary");
	const [mergeComment, setMergeComment] = useState("");

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
		mutationFn: async ({
			mergeMethod,
			commitMessage,
		}: {
			mergeMethod: MergeMethod;
			commitMessage?: string;
		}) => {
			if (!hostUrl || !projectId || prNumber === null) {
				throw new Error("This project isn't linked to a GitHub repository.");
			}
			const client = getHostServiceClientByUrl(hostUrl);
			return client.pullRequests.mergePR.mutate({
				projectId,
				prNumber,
				mergeMethod,
				commitMessage,
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
			mergePullRequest.mutate({
				mergeMethod: pendingAction.method,
				commitMessage: mergeComment.trim() || undefined,
			});
		}
		setPendingAction(null);
		setMergeComment("");
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
	const canMerge = data?.state === "open" && !data.isDraft;
	// The list pane is always visible in the split view (or reachable via the
	// list-collapse toggle in the shared layout), so there's no "back"
	// affordance here — just the PR identity and its actions.
	const itemNumber = data?.number ?? prNumber;
	const createdAtMs = data?.createdAt
		? new Date(data.createdAt).getTime()
		: null;
	const createdAtRelative =
		createdAtMs === null ? null : formatRelativeTime(createdAtMs);
	const createdAtLabel =
		createdAtRelative === null
			? null
			: createdAtRelative === "now"
				? "now"
				: `${createdAtRelative} ago`;
	const header = (
		<div className="flex shrink-0 flex-col border-b border-border">
			<div className="flex h-10 shrink-0 items-center gap-1 px-4">
				<PullRequestListToggle />
				<div className="ml-2 flex items-center gap-1">
					{DETAIL_TABS.map(({ value, label }) => (
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
			</div>

			<div className="flex items-start justify-between gap-3 px-4 pb-3">
				{isLoading ? (
					<Skeleton className="h-6 w-72 max-w-full" />
				) : (
					<h1 className="min-w-0 truncate text-xl font-semibold leading-tight">
						{data?.title ??
							(itemNumber === null ? "Pull request" : `#${itemNumber}`)}
					</h1>
				)}
				{data && (
					<div className="flex shrink-0 items-center gap-2">
						<Button variant="ghost" size="icon-sm" asChild>
							<a
								href={data.url}
								target="_blank"
								rel="noopener noreferrer"
								aria-label="Open pull request in GitHub"
								title="Open pull request in GitHub"
							>
								<FaGithub className="size-4" />
							</a>
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="h-8 px-3"
							onClick={handleAddToWorkspace}
						>
							Start Workspace
						</Button>
						{canMerge && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										className="h-8 gap-1.5 px-3 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15 hover:text-emerald-600 [.dark_&]:text-[#34d399] [.dark_&]:hover:text-[#34d399]"
										disabled={isActionPending}
										aria-label="Merge pull request"
									>
										<VscGitMerge className="size-4" />
										Merge
										<VscChevronDown className="size-3" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-80 p-0">
									<div className="p-3 pb-2">
										<Textarea
											value={mergeComment}
											onChange={(e) => setMergeComment(e.target.value)}
											onKeyDown={(e) => e.stopPropagation()}
											placeholder="Leave a comment (optional)"
											className="min-h-16 resize-none text-sm"
										/>
									</div>
									<DropdownMenuLabel className="px-3 pb-1 pt-0 text-xs font-normal text-muted-foreground">
										Select method
									</DropdownMenuLabel>
									{(["squash", "merge", "rebase"] as const).map((method) => (
										<DropdownMenuItem
											key={method}
											className="flex-col items-start gap-0.5 px-3 py-2"
											onClick={() =>
												setPendingAction({ kind: "merge", method })
											}
										>
											<span className="text-sm font-medium">
												{MERGE_METHOD_LABELS[method]}
											</span>
											<span className="text-xs text-muted-foreground">
												{MERGE_METHOD_DESCRIPTIONS[method]}
											</span>
										</DropdownMenuItem>
									))}
									{(data.checksStatus === "pending" ||
										data.checksStatus === "failure") && (
										<>
											<DropdownMenuSeparator />
											{data.checksStatus === "pending" && (
												<DropdownMenuItem
													className="flex items-center justify-between gap-2 px-3 py-2"
													onClick={() =>
														toast.info("Auto-merge is coming soon")
													}
												>
													<div className="flex flex-col gap-0.5">
														<span className="text-sm font-medium">
															Enable auto-merge
														</span>
														<span className="text-xs text-muted-foreground">
															Merge when checks pass
														</span>
													</div>
													<LuChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
												</DropdownMenuItem>
											)}
											{data.checksStatus === "failure" && (
												<DropdownMenuItem
													className="flex items-center justify-between gap-2 px-3 py-2"
													onClick={() =>
														setPendingAction({
															kind: "merge",
															method: "squash",
															force: true,
														})
													}
												>
													<div className="flex flex-col gap-0.5">
														<span className="text-sm font-medium">
															Force merge
														</span>
														<span className="text-xs text-muted-foreground">
															Attempt before checks pass
														</span>
													</div>
													<LuChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
												</DropdownMenuItem>
											)}
										</>
									)}
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</div>
				)}
			</div>

			{isLoading && (
				<div className="flex flex-wrap items-center gap-2 px-4 pb-3">
					<Skeleton className="h-[22px] w-16 rounded-full" />
					<Skeleton className="size-5 rounded-full" />
					<Skeleton className="h-3 w-20" />
					<Skeleton className="h-3 w-10" />
					<Skeleton className="h-3 w-14" />
				</div>
			)}
			{data && (
				<div className="flex flex-wrap items-center gap-2 px-4 pb-3 text-xs text-muted-foreground">
					<span
						className={cn(
							"inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-medium capitalize",
							STATE_BADGE_STYLES[state],
						)}
					>
						<PRIcon state={state} className="size-3" />
						{data.isDraft ? "Draft" : data.state}
					</span>
					{data.author && (
						<span className="flex shrink-0 items-center gap-1.5">
							<Avatar className="size-5 rounded-full">
								<AvatarImage
									src={`https://github.com/${data.author}.png?size=64`}
									alt={data.author}
								/>
								<AvatarFallback className="text-[9px]">
									{data.author.slice(0, 1).toUpperCase()}
								</AvatarFallback>
							</Avatar>
							{data.author}
						</span>
					)}
					<span aria-hidden>·</span>
					<span className="shrink-0 font-mono tabular-nums">
						#{data.number}
					</span>
					{createdAtLabel !== null && (
						<>
							<span aria-hidden>·</span>
							<span className="shrink-0">{createdAtLabel}</span>
						</>
					)}
				</div>
			)}
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
								: pendingAction?.kind === "merge" && pendingAction.force
									? `Force merge #${data.number}?`
									: `Merge #${data.number}?`}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{pendingAction?.kind === "close"
								? `"${data.title}" will be marked closed on GitHub. You can reopen it from here at any time.`
								: `"${data.title}" will be merged into ${data.baseBranch}${
										pendingAction?.kind === "merge"
											? ` via ${MERGE_METHOD_LABELS[pendingAction.method].toLowerCase()}`
											: ""
									}.${
										pendingAction?.kind === "merge" && pendingAction.force
											? " Checks haven't passed yet — this overrides them."
											: ""
									} This can't be undone from here.`}
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
								pendingAction?.kind === "close" ||
								(pendingAction?.kind === "merge" && pendingAction.force)
									? "destructive"
									: "default"
							}
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={handleConfirmAction}
						>
							{pendingAction?.kind === "close"
								? "Close pull request"
								: pendingAction?.kind === "merge" && pendingAction.force
									? "Force merge"
									: "Merge pull request"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</EnterEnabledAlertDialogContent>
			</AlertDialog>
			<ScrollArea className="min-h-0 flex-1">
				{activeTab === "summary" ? (
					<div className="grid w-full gap-8 px-4 py-6 @md:px-6 @4xl:grid-cols-[minmax(0,1fr)_20rem] @4xl:py-8">
						<article className="min-w-0">
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
				) : (
					<p className="px-4 py-12 text-center text-sm text-muted-foreground @md:px-6">
						Code view is coming soon.
					</p>
				)}
			</ScrollArea>
		</div>
	);
}
