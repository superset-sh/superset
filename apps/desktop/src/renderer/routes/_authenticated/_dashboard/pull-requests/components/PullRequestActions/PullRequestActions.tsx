import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
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
	DropdownMenuRadioGroup,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMutation } from "@tanstack/react-query";
import {
	Bot,
	Check,
	ChevronDown,
	ChevronRight,
	GitMerge,
	GitPullRequestArrow,
	GitPullRequestClosed,
	GitPullRequestDraft,
	Hammer,
	Link2,
	LoaderCircle,
	SquareArrowOutUpRight,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { useOpenNewWorkspace } from "renderer/hooks/useOpenNewWorkspace";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { normalizePRState } from "renderer/screens/main/components/PRIcon";
import {
	type LinkedPR,
	useNewWorkspaceDraftStore,
} from "renderer/stores/new-workspace-draft";
import { usePullRequestAgentHandoff } from "../../hooks/usePullRequestAgentHandoff";
import {
	type PullRequestDetail,
	useInvalidatePullRequestDetail,
} from "../../hooks/usePullRequestDetail";
import { usePullRequestDraftMutation } from "../../hooks/usePullRequestDraftMutation";
import {
	buildFixFindingsPrompt,
	buildResolveConflictsPrompt,
} from "../../utils/buildPullRequestRepairPrompts";
import {
	PullRequestMenuContent,
	PullRequestMenuItem,
	PullRequestMenuLabel,
	PullRequestMenuRadioItem,
	PullRequestMenuSeparator,
} from "../PullRequestMenu";
import { PullRequestSkeleton as Skeleton } from "../PullRequestSkeleton";

type MergeMethod = "merge" | "squash" | "rebase";

type PendingAction =
	| { kind: "close" }
	| { kind: "merge"; method: MergeMethod; force?: boolean };

interface PullRequestActionsProps {
	projectId: string | null;
	hostId: string | null;
	hostUrl: string | null;
	/** Parsed PR number; null when the route param is malformed. */
	prNumber: number | null;
	data: PullRequestDetail | null | undefined;
	isLoading: boolean;
	/**
	 * Offer "Start workspace". Off inside a workspace pane, where the PR is
	 * already the workspace's own and a second one would be a duplicate.
	 */
	showStartWorkspace?: boolean;
}

function IconAction({
	label,
	children,
	...props
}: {
	label: string;
	children: ReactNode;
} & Omit<React.ComponentProps<typeof Button>, "children">) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon-xs"
					className="text-muted-foreground hover:text-foreground [&_svg]:opacity-80 hover:[&_svg]:opacity-100"
					aria-label={label}
					{...props}
				>
					{children}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}

/**
 * The top bar's controls for one pull request: copy link, open on GitHub,
 * start a workspace on it, and the Merge split pill with its method menu and
 * confirmation. Identity (title, author, state) lives in PullRequestItemHeader.
 */
export function PullRequestActions({
	projectId,
	hostId,
	hostUrl,
	prNumber,
	data,
	isLoading,
	showStartWorkspace = true,
}: PullRequestActionsProps) {
	const { t } = useLingui();
	const mergeMethodLabels: Record<MergeMethod, string> = {
		squash: t({ message: "Squash and merge" }),
		merge: t({ message: "Merge commit" }),
		rebase: t({ message: "Rebase and merge" }),
	};
	const mergeMethodDescriptions: Record<MergeMethod, string> = {
		squash: t({ message: "Combine all commits" }),
		merge: t({ message: "Preserve commit history" }),
		rebase: t({ message: "Reapply all commits" }),
	};
	const updateDraft = useNewWorkspaceDraftStore((state) => state.updateDraft);
	const selectProject = useNewWorkspaceDraftStore(
		(state) => state.selectProject,
	);
	const resetDraft = useNewWorkspaceDraftStore((state) => state.resetDraft);
	const openNewWorkspace = useOpenNewWorkspace();
	const [pendingAction, setPendingAction] = useState<PendingAction | null>(
		null,
	);
	const [mergeComment, setMergeComment] = useState("");
	const { copyToClipboard: copyLink, copied: linkCopied } =
		useCopyToClipboard();
	const invalidatePullRequestQueries = useInvalidatePullRequestDetail({
		projectId,
		hostUrl,
		prNumber,
	});
	const handoff = usePullRequestAgentHandoff(
		projectId && hostId && hostUrl && prNumber !== null
			? { projectId, hostId, hostUrl, prNumber }
			: null,
	);
	const setDraft = usePullRequestDraftMutation({
		projectId: projectId ?? "",
		hostUrl: hostUrl ?? "",
		prNumber: prNumber ?? 0,
	});

	const setPullRequestState = useMutation({
		mutationFn: async (nextState: "open" | "closed") => {
			if (!hostUrl || !projectId || prNumber === null) {
				throw new Error(
					t({ message: "This project isn't linked to a GitHub repository." }),
				);
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
			toast.error(t({ message: "Couldn't update pull request" }), {
				description: errorMessage(mutationError),
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
				throw new Error(
					t({ message: "This project isn't linked to a GitHub repository." }),
				);
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
			toast.error(t({ message: "Couldn't merge pull request" }), {
				description: errorMessage(mutationError),
			});
		},
	});

	const isActionPending =
		setPullRequestState.isPending ||
		mergePullRequest.isPending ||
		setDraft.isPending;

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

	const handleStartWorkspace = () => {
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
		openNewWorkspace(projectId);
	};

	const repairItems = data ? (
		<>
			<PullRequestMenuItem
				disabled={!handoff.available || handoff.isPending}
				onClick={() => handoff.handOff(buildFixFindingsPrompt(data))}
			>
				<Hammer strokeWidth={1.75} />
				{handoff.isPending ? (
					<Trans>Handing to agent…</Trans>
				) : (
					<Trans>Fix findings</Trans>
				)}
			</PullRequestMenuItem>
			{data.state === "open" && data.mergeability === "conflicting" ? (
				<PullRequestMenuItem
					disabled={!handoff.available || handoff.isPending}
					onClick={() => handoff.handOff(buildResolveConflictsPrompt(data))}
				>
					<GitMerge strokeWidth={1.75} className="text-destructive" />
					<Trans>Resolve conflicts</Trans>
				</PullRequestMenuItem>
			) : null}
		</>
	) : null;

	if (isLoading && !data) {
		return (
			<div className="flex shrink-0 items-center gap-1.5">
				<Skeleton className="size-7 rounded-md" />
				<Skeleton className="size-7 rounded-md" />
				<Skeleton className="h-7 w-28 rounded-md" />
				<Skeleton className="h-7 w-20 rounded-md" />
			</div>
		);
	}
	if (!data) return null;

	const canMerge = data.state === "open" && !data.isDraft;
	const canAct = !!hostUrl && !!projectId && prNumber !== null;
	const canToggleDraft = canAct && data.mergeability !== undefined;
	const isDraft = data.state === "open" && data.isDraft;
	const mergeBlocked = data.mergeability === "conflicting";
	const copyLinkLabel = linkCopied
		? t({ message: "Copied" })
		: t({ message: "Copy link" });

	return (
		<div className="flex shrink-0 items-center gap-1">
			<IconAction
				label={copyLinkLabel}
				onClick={() => {
					void copyLink(data.url).catch(() =>
						toast.error(t({ message: "Couldn't copy link" })),
					);
				}}
			>
				{linkCopied ? (
					<Check strokeWidth={1.75} className="size-4" />
				) : (
					<Link2 strokeWidth={1.75} className="size-4 -rotate-45" />
				)}
			</IconAction>
			<IconAction label={t({ message: "Open on GitHub" })} asChild>
				<a href={data.url} target="_blank" rel="noopener noreferrer">
					<SquareArrowOutUpRight strokeWidth={1.75} className="size-4" />
				</a>
			</IconAction>
			{showStartWorkspace && projectId && hostId ? (
				<Button
					variant="outline"
					size="xs"
					className="ml-1 h-7 gap-1.5 rounded-full px-3 @max-[34rem]/topbar:px-2"
					aria-label={t({ message: "Send to agent" })}
					onClick={handleStartWorkspace}
				>
					<Bot strokeWidth={1.75} className="size-3.5" />
					<span className="@max-[34rem]/topbar:hidden">
						<Trans>Send to agent</Trans>
					</span>
				</Button>
			) : null}
			{((isDraft && canToggleDraft) || canMerge) && canAct ? (
				<div className="ml-1 flex items-stretch">
					{isDraft ? (
						<Button
							size="xs"
							className="h-7 gap-1.5 rounded-l-full rounded-r-none px-3"
							disabled={isActionPending}
							aria-busy={setDraft.isPending}
							onClick={() => setDraft.mutate(false)}
						>
							{setDraft.isPending ? (
								<LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
							) : (
								<GitPullRequestArrow strokeWidth={1.75} className="size-3.5" />
							)}
							<span className="@max-[23rem]/topbar:sr-only">
								{setDraft.isPending ? (
									<Trans>Marking ready…</Trans>
								) : (
									<Trans>Ready for review</Trans>
								)}
							</span>
						</Button>
					) : (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									size="xs"
									variant={mergeBlocked ? "secondary" : "default"}
									className={cn(
										"h-7 gap-1.5 rounded-l-full rounded-r-none px-3",
										mergeBlocked && "cursor-not-allowed text-muted-foreground",
									)}
									disabled={isActionPending}
									aria-disabled={mergeBlocked || undefined}
									aria-busy={mergePullRequest.isPending}
									onClick={() => {
										if (mergeBlocked) return;
										setPendingAction({ kind: "merge", method: "squash" });
									}}
								>
									{mergePullRequest.isPending ? (
										<LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
									) : (
										<GitMerge strokeWidth={1.75} className="size-3.5" />
									)}
									<span className="@max-[23rem]/topbar:sr-only">
										{mergePullRequest.isPending ? (
											<Trans>Merging…</Trans>
										) : (
											<Trans>Merge</Trans>
										)}
									</span>
								</Button>
							</TooltipTrigger>
							{mergeBlocked ? (
								<TooltipContent side="bottom">
									<Trans>
										Resolve the conflicts with {data.base.ref} first
									</Trans>
								</TooltipContent>
							) : null}
						</Tooltip>
					)}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								size="xs"
								variant={!isDraft && mergeBlocked ? "secondary" : "default"}
								className={cn(
									"h-7 rounded-l-none rounded-r-full border-l px-1.5",
									!isDraft && mergeBlocked
										? "border-l-border"
										: "border-l-primary-foreground/20",
								)}
								disabled={isActionPending}
								aria-label={t({ message: "More actions" })}
							>
								<ChevronDown className="size-3.5" />
							</Button>
						</DropdownMenuTrigger>
						<PullRequestMenuContent
							align="end"
							className={isDraft ? "w-56" : "w-72"}
						>
							{isDraft ? (
								<>
									<DropdownMenuRadioGroup
										value="draft"
										onValueChange={(value) => {
											if (value === "ready") setDraft.mutate(false);
										}}
									>
										<PullRequestMenuRadioItem value="draft">
											<GitPullRequestDraft className="size-4" />
											<Trans>Draft</Trans>
										</PullRequestMenuRadioItem>
										<PullRequestMenuRadioItem value="ready">
											<GitPullRequestArrow className="size-4" />
											<Trans>Ready for review</Trans>
										</PullRequestMenuRadioItem>
									</DropdownMenuRadioGroup>
									<PullRequestMenuSeparator />
									{repairItems}
									<PullRequestMenuSeparator />
									<PullRequestMenuItem
										variant="destructive"
										disabled={isActionPending}
										onClick={() => setPendingAction({ kind: "close" })}
									>
										<GitPullRequestClosed className="size-4" />
										<Trans>Close pull request</Trans>
									</PullRequestMenuItem>
								</>
							) : (
								<>
									<div className="p-1.5 pb-1">
										<Textarea
											value={mergeComment}
											onChange={(e) => setMergeComment(e.target.value)}
											onKeyDown={(e) => e.stopPropagation()}
											placeholder={t({ message: "Commit message (optional)" })}
											className="min-h-16 resize-none rounded-[0.625rem] border-border/60 bg-background/60 text-xs shadow-none"
										/>
									</div>
									<PullRequestMenuLabel className="pt-1">
										<Trans>Select method</Trans>
									</PullRequestMenuLabel>
									{(["squash", "merge", "rebase"] as const).map((method) => (
										<PullRequestMenuItem
											key={method}
											className="flex-col items-start gap-0 py-1.5"
											disabled={mergeBlocked}
											onClick={() =>
												setPendingAction({ kind: "merge", method })
											}
										>
											<span className="flex items-center gap-2">
												<GitMerge
													strokeWidth={1.75}
													className="size-3.5 opacity-80"
												/>
												{mergeMethodLabels[method]}
											</span>
											<span className="pl-[1.375rem] text-[11px] text-muted-foreground">
												{mergeMethodDescriptions[method]}
											</span>
										</PullRequestMenuItem>
									))}
									{data.checksStatus === "failure" && (
										<>
											<PullRequestMenuSeparator />
											<PullRequestMenuItem
												className="flex items-center justify-between gap-2 py-1.5"
												disabled={mergeBlocked}
												onClick={() =>
													setPendingAction({
														kind: "merge",
														method: "squash",
														force: true,
													})
												}
											>
												<div className="flex flex-col gap-0.5">
													<span>
														<Trans>Force merge</Trans>
													</span>
													<span className="text-[11px] text-muted-foreground">
														<Trans>Attempt before checks pass</Trans>
													</span>
												</div>
												<ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
											</PullRequestMenuItem>
										</>
									)}
									<PullRequestMenuSeparator />
									{repairItems}
									<PullRequestMenuSeparator />
									{canToggleDraft ? (
										<PullRequestMenuItem
											disabled={isActionPending}
											onClick={() => setDraft.mutate(true)}
										>
											<GitPullRequestDraft className="size-4" />
											<Trans>Convert to draft</Trans>
										</PullRequestMenuItem>
									) : null}
									<PullRequestMenuItem
										variant="destructive"
										disabled={isActionPending}
										onClick={() => setPendingAction({ kind: "close" })}
									>
										<GitPullRequestClosed className="size-4" />
										<Trans>Close pull request</Trans>
									</PullRequestMenuItem>
								</>
							)}
						</PullRequestMenuContent>
					</DropdownMenu>
				</div>
			) : data.state === "closed" && canAct ? (
				<Button
					variant="outline"
					size="xs"
					className="ml-1 h-7 rounded-full px-3"
					disabled={isActionPending}
					onClick={() => setPullRequestState.mutate("open")}
				>
					{setPullRequestState.isPending ? (
						<Trans>Reopening…</Trans>
					) : (
						<Trans>Reopen</Trans>
					)}
				</Button>
			) : null}

			<AlertDialog
				open={pendingAction !== null}
				onOpenChange={(open) => {
					if (!open) setPendingAction(null);
				}}
			>
				<EnterEnabledAlertDialogContent className="max-w-[360px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pb-2 pt-4">
						<AlertDialogTitle className="font-medium">
							{pendingAction?.kind === "close" ? (
								<Trans>Close #{data.number}?</Trans>
							) : pendingAction?.kind === "merge" && pendingAction.force ? (
								<Trans>Force merge #{data.number}?</Trans>
							) : (
								<Trans>Merge #{data.number}?</Trans>
							)}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{pendingAction?.kind === "close" ? (
								<Trans>
									"{data.title}" will be marked closed on GitHub. You can reopen
									it from here at any time.
								</Trans>
							) : pendingAction?.kind === "merge" && pendingAction.force ? (
								<Trans>
									"{data.title}" will be merged into {data.base.ref} via{" "}
									{mergeMethodLabels[pendingAction.method]}. Checks haven't
									passed yet — this overrides them. This can't be undone from
									here.
								</Trans>
							) : pendingAction?.kind === "merge" ? (
								<Trans>
									"{data.title}" will be merged into {data.base.ref} via{" "}
									{mergeMethodLabels[pendingAction.method]}. This can't be
									undone from here.
								</Trans>
							) : null}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="flex-row justify-end gap-2 px-4 pb-4 pt-2">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => setPendingAction(null)}
						>
							<Trans>Cancel</Trans>
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
							{pendingAction?.kind === "close" ? (
								<Trans>Close pull request</Trans>
							) : pendingAction?.kind === "merge" && pendingAction.force ? (
								<Trans>Force merge</Trans>
							) : (
								<Trans>Merge pull request</Trans>
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</EnterEnabledAlertDialogContent>
			</AlertDialog>
		</div>
	);
}
