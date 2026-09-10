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
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { LuCheck, LuChevronRight, LuGitBranch } from "react-icons/lu";
import { VscChevronDown, VscGitMerge } from "react-icons/vsc";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { useOpenNewWorkspace } from "renderer/hooks/useOpenNewWorkspace";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	normalizePRState,
	PRIcon,
	type PRState,
} from "renderer/screens/main/components/PRIcon";
import {
	type LinkedPR,
	useNewWorkspaceDraftStore,
} from "renderer/stores/new-workspace-draft";
import {
	type PullRequestDetail,
	useInvalidatePullRequestDetail,
} from "../../hooks/usePullRequestDetail";

type MergeMethod = "merge" | "squash" | "rebase";

type PendingAction =
	| { kind: "close" }
	| { kind: "merge"; method: MergeMethod; force?: boolean };

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

interface PullRequestDetailHeaderProps {
	projectId: string | null;
	hostId: string | null;
	hostUrl: string | null;
	/** Parsed PR number; null when the route param is malformed. */
	prNumber: number | null;
	data: PullRequestDetail | null | undefined;
	isLoading: boolean;
	/**
	 * Offer "Start Workspace". Off inside a workspace pane, where the PR is
	 * already the workspace's own and a second one would be a duplicate.
	 */
	showStartWorkspace?: boolean;
}

/**
 * The PR's identity and actions: title, GitHub link, optional Start
 * Workspace, the merge menu with its confirmation, and the state/author/
 * branch/age meta row. Renders skeletons while the detail loads and a bare
 * "#N" when it fails, so the surrounding layout holds still either way.
 * Renders as a fragment so the host decides the column it sits in.
 */
export function PullRequestDetailHeader({
	projectId,
	hostId,
	hostUrl,
	prNumber,
	data,
	isLoading,
	showStartWorkspace = true,
}: PullRequestDetailHeaderProps) {
	const { t } = useLingui();
	const mergeMethodLabels: Record<MergeMethod, string> = {
		squash: t({
			message: "Squash and merge",
		}),
		merge: t({
			message: "Merge commit",
		}),
		rebase: t({
			message: "Rebase and merge",
		}),
	};
	const mergeMethodDescriptions: Record<MergeMethod, string> = {
		squash: t({
			message: "Combine all commits",
		}),
		merge: t({
			message: "Preserve commit history",
		}),
		rebase: t({
			message: "Reapply all commits",
		}),
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
	const { copyToClipboard: copyBranch, copied: branchCopied } =
		useCopyToClipboard();
	const invalidatePullRequestQueries = useInvalidatePullRequestDetail({
		projectId,
		hostUrl,
		prNumber,
	});

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
			toast.error(
				t({
					message: "Couldn't update pull request",
				}),
				{
					description: errorMessage(mutationError),
				},
			);
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
			toast.error(
				t({
					message: "Couldn't merge pull request",
				}),
				{
					description: errorMessage(mutationError),
				},
			);
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
		openNewWorkspace(projectId);
	};

	const defaultState = normalizePRState("open", false);
	const state = data
		? normalizePRState(data.state, data.isDraft)
		: defaultState;
	const canMerge = data?.state === "open" && !data.isDraft;
	const itemNumber = data?.number ?? prNumber;
	const createdAtMs = data?.createdAt
		? new Date(data.createdAt).getTime()
		: null;
	const createdAtRelative =
		createdAtMs === null ? null : formatRelativeTime(createdAtMs);

	return (
		<>
			<div className="flex flex-wrap items-start justify-between gap-3 px-4 pb-3">
				{isLoading ? (
					<Skeleton className="h-6 w-72 max-w-full" />
				) : (
					<h1 className="min-w-[12rem] flex-1 select-text truncate text-xl font-semibold leading-tight">
						{data?.title ??
							(itemNumber === null ? (
								<Trans>Pull request</Trans>
							) : (
								`#${itemNumber}`
							))}
					</h1>
				)}
				{data && (
					<div className="flex shrink-0 items-center gap-2">
						<Button variant="ghost" size="icon-sm" asChild>
							<a
								href={data.url}
								target="_blank"
								rel="noopener noreferrer"
								aria-label={t({
									message: "Open pull request in GitHub",
								})}
								title={t({
									message: "Open pull request in GitHub",
								})}
							>
								<FaGithub className="size-4" />
							</a>
						</Button>
						{showStartWorkspace && (
							<Button
								variant="outline"
								size="sm"
								className="h-8 px-3"
								onClick={handleAddToWorkspace}
							>
								<Trans>Start Workspace</Trans>
							</Button>
						)}
						{canMerge && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										className="h-8 gap-1.5 px-3 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15 hover:text-emerald-600 [.dark_&]:text-[#34d399] [.dark_&]:hover:text-[#34d399]"
										disabled={isActionPending}
										aria-label={t({
											message: "Merge pull request",
										})}
									>
										<VscGitMerge className="size-4" />
										<Trans>Merge</Trans>
										<VscChevronDown className="size-3" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-80 p-0">
									<div className="p-3 pb-2">
										<Textarea
											value={mergeComment}
											onChange={(e) => setMergeComment(e.target.value)}
											onKeyDown={(e) => e.stopPropagation()}
											placeholder={t({
												message: "Leave a comment (optional)",
											})}
											className="min-h-16 resize-none text-sm"
										/>
									</div>
									<DropdownMenuLabel className="px-3 pb-1 pt-0 text-xs font-normal text-muted-foreground">
										<Trans>Select method</Trans>
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
												{mergeMethodLabels[method]}
											</span>
											<span className="text-xs text-muted-foreground">
												{mergeMethodDescriptions[method]}
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
														toast.info(
															t({
																message: "Auto-merge is coming soon",
															}),
														)
													}
												>
													<div className="flex flex-col gap-0.5">
														<span className="text-sm font-medium">
															<Trans>Enable auto-merge</Trans>
														</span>
														<span className="text-xs text-muted-foreground">
															<Trans>Merge when checks pass</Trans>
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
															<Trans>Force merge</Trans>
														</span>
														<span className="text-xs text-muted-foreground">
															<Trans>Attempt before checks pass</Trans>
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
						{data.isDraft ? <Trans>Draft</Trans> : data.state}
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
					<span className="inline-flex shrink-0 items-center gap-2">
						<span aria-hidden>·</span>
						<span className="font-mono tabular-nums">#{data.number}</span>
					</span>
					<span className="inline-flex min-w-0 shrink items-center gap-2">
						<span aria-hidden>·</span>
						<Tooltip delayDuration={1000}>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => {
										copyBranch(data.branch)
											.then(() => {
												toast.success(
													t({
														message: "Branch copied",
													}),
													{
														description: data.branch,
														icon: (
															<span className="flex size-4 items-center justify-center rounded-full bg-emerald-500">
																<LuCheck
																	className="size-2.5 text-white"
																	strokeWidth={3}
																/>
															</span>
														),
													},
												);
											})
											.catch(() => {
												toast.error(
													t({
														message: "Couldn't copy branch name",
													}),
												);
											});
									}}
									className="flex min-w-0 shrink items-center gap-1 font-mono text-muted-foreground hover:text-foreground"
								>
									<LuGitBranch className="size-3 shrink-0" />
									<span className="truncate hover:underline">
										{data.branch}
									</span>
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								{branchCopied ? (
									<Trans>Copied</Trans>
								) : (
									<Trans>Click to copy</Trans>
								)}
							</TooltipContent>
						</Tooltip>
					</span>
					{createdAtRelative !== null && (
						<span className="inline-flex shrink-0 items-center gap-2">
							<span aria-hidden>·</span>
							<span>
								{createdAtRelative === "now" ? (
									<Trans>now</Trans>
								) : (
									<Trans>{createdAtRelative} ago</Trans>
								)}
							</span>
						</span>
					)}
				</div>
			)}

			{data && (
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
										"{data.title}" will be marked closed on GitHub. You can
										reopen it from here at any time.
									</Trans>
								) : pendingAction?.kind === "merge" && pendingAction.force ? (
									<Trans>
										"{data.title}" will be merged into {data.baseBranch} via{" "}
										{mergeMethodLabels[pendingAction.method].toLowerCase()}.
										Checks haven't passed yet — this overrides them. This can't
										be undone from here.
									</Trans>
								) : pendingAction?.kind === "merge" ? (
									<Trans>
										"{data.title}" will be merged into {data.baseBranch} via{" "}
										{mergeMethodLabels[pendingAction.method].toLowerCase()}.
										This can't be undone from here.
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
			)}
		</>
	);
}
