import type { GitHubStatus, PullRequestComment } from "@superset/local-db";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { LuArrowUpRight, LuCheck, LuCopy } from "react-icons/lu";
import { VscChevronRight } from "react-icons/vsc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { PRIcon } from "renderer/screens/main/components/PRIcon";
import {
	ALL_COMMENTS_COPY_ACTION_KEY,
	buildAllCommentsClipboardText,
	buildCommentClipboardText,
	checkIconConfig,
	checkSummaryIconConfig,
	countOpenPullRequestComments,
	formatShortAge,
	getCommentAvatarFallback,
	getCommentCopyActionKey,
	getCommentKindText,
	getCommentPreviewText,
	prStateLabel,
	resolveCheckDestinationUrl,
	reviewDecisionConfig,
	splitPullRequestComments,
} from "./utils";

interface ReviewPanelProps {
	pr: GitHubStatus["pr"] | null;
	comments?: PullRequestComment[];
	isLoading?: boolean;
	isCommentsLoading?: boolean;
}

export function ReviewPanel({
	pr,
	comments = [],
	isLoading = false,
	isCommentsLoading = false,
}: ReviewPanelProps) {
	const [checksOpen, setChecksOpen] = useState(true);
	const [commentsOpen, setCommentsOpen] = useState(true);
	const [openCommentsGroupOpen, setOpenCommentsGroupOpen] = useState(true);
	const [resolvedCommentsGroupOpen, setResolvedCommentsGroupOpen] =
		useState(false);
	const [copiedActionKey, setCopiedActionKey] = useState<string | null>(null);
	const copiedActionResetTimeoutRef = useRef<ReturnType<
		typeof setTimeout
	> | null>(null);
	const copyToClipboardMutation = electronTrpc.external.copyText.useMutation();

	useEffect(() => {
		return () => {
			if (copiedActionResetTimeoutRef.current) {
				clearTimeout(copiedActionResetTimeoutRef.current);
			}
		};
	}, []);

	const markCopiedAction = (actionKey: string) => {
		if (copiedActionResetTimeoutRef.current) {
			clearTimeout(copiedActionResetTimeoutRef.current);
		}

		setCopiedActionKey(actionKey);
		copiedActionResetTimeoutRef.current = setTimeout(() => {
			setCopiedActionKey(null);
			copiedActionResetTimeoutRef.current = null;
		}, 1500);
	};

	const copyTextToClipboard = async ({
		text,
		actionKey,
		errorLabel,
	}: {
		text: string;
		actionKey: string;
		errorLabel: string;
	}) => {
		try {
			await copyToClipboardMutation.mutateAsync(text);
			markCopiedAction(actionKey);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			toast.error(`${errorLabel}: ${message}`);
		}
	};

	const handleCopySingleComment = (comment: PullRequestComment) => {
		void copyTextToClipboard({
			text: buildCommentClipboardText(comment),
			actionKey: getCommentCopyActionKey(comment.id),
			errorLabel: "Failed to copy comment",
		});
	};

	if (isLoading && !pr) {
		return (
			<div className="flex h-full flex-col overflow-y-auto px-2 py-2">
				<div className="border-b border-border/70 px-0 pb-2">
					<div className="flex items-center gap-2 px-2">
						<Skeleton className="h-4 w-4 rounded-sm" />
						<Skeleton className="h-4 flex-1" />
						<Skeleton className="h-3 w-10" />
					</div>
					<div className="mt-2 flex items-center gap-2 px-2">
						<Skeleton className="h-4 w-24 rounded-sm" />
						<Skeleton className="h-3 w-28" />
					</div>
				</div>
				<div className="border-b border-border/60 px-0 py-2">
					<div className="flex items-center justify-between px-2 pb-1">
						<Skeleton className="h-3 w-10" />
						<Skeleton className="h-3 w-24" />
					</div>
					<div className="space-y-1 px-1">
						<Skeleton className="h-8 w-full rounded-sm" />
						<Skeleton className="h-8 w-full rounded-sm" />
					</div>
				</div>
				<div className="px-0 py-2">
					<div className="flex items-center justify-between px-2 pb-1">
						<Skeleton className="h-3 w-14" />
						<Skeleton className="h-3 w-6" />
					</div>
					<div className="space-y-1 px-1">
						<Skeleton className="h-11 w-full rounded-sm" />
						<Skeleton className="h-11 w-full rounded-sm" />
						<Skeleton className="h-11 w-full rounded-sm" />
					</div>
				</div>
			</div>
		);
	}

	if (!pr) {
		return (
			<div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
				Open a pull request to view review status, checks, and comments.
			</div>
		);
	}

	const requestedReviewers = pr.requestedReviewers ?? [];
	const reviewLabel =
		pr.reviewDecision === "pending" && requestedReviewers.length > 0
			? `Awaiting ${requestedReviewers.join(", ")}`
			: reviewDecisionConfig[pr.reviewDecision].label;

	const relevantChecks = pr.checks.filter(
		(check) => check.status !== "skipped" && check.status !== "cancelled",
	);
	const passingChecks = relevantChecks.filter(
		(check) => check.status === "success",
	).length;
	const checksSummary =
		relevantChecks.length > 0
			? `${passingChecks}/${relevantChecks.length} checks passing`
			: "No checks reported";
	const checksStatus = relevantChecks.length > 0 ? pr.checksStatus : "none";
	const checksStatusConfig = checkSummaryIconConfig[checksStatus];
	const ChecksStatusIcon = checksStatusConfig.icon;
	const { active: activeComments, resolved: resolvedComments } =
		splitPullRequestComments(comments);
	const commentsCountLabel = isCommentsLoading
		? "..."
		: countOpenPullRequestComments(comments);
	const copyAllCommentsLabel =
		copiedActionKey === ALL_COMMENTS_COPY_ACTION_KEY ? "Copied" : "Copy all";

	const handleCopyCommentsList = () => {
		void copyTextToClipboard({
			text: buildAllCommentsClipboardText(activeComments),
			actionKey: ALL_COMMENTS_COPY_ACTION_KEY,
			errorLabel: "Failed to copy comments",
		});
	};

	const renderCommentList = (list: PullRequestComment[]) =>
		list.map((comment) => {
			const age = formatShortAge(comment.createdAt);
			const commentCopyActionKey = getCommentCopyActionKey(comment.id);
			const isCopied = copiedActionKey === commentCopyActionKey;
			const content = (
				<>
					<Avatar className="mt-0.5 size-4 shrink-0">
						{comment.avatarUrl ? (
							<AvatarImage src={comment.avatarUrl} alt={comment.authorLogin} />
						) : null}
						<AvatarFallback className="text-[10px] font-medium">
							{getCommentAvatarFallback(comment.authorLogin)}
						</AvatarFallback>
					</Avatar>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1.5">
							<span className="truncate text-xs font-medium text-foreground">
								{comment.authorLogin}
							</span>
							<span className="shrink-0 rounded border border-border/70 bg-muted/35 px-1 py-0 text-[9px] uppercase tracking-wide text-muted-foreground">
								{getCommentKindText(comment)}
							</span>
							{age ? (
								<span className="shrink-0 text-[10px] text-muted-foreground">
									{age}
								</span>
							) : null}
						</div>
						<p className="mt-0.5 line-clamp-1 text-xs leading-4 text-muted-foreground">
							{getCommentPreviewText(comment.body)}
						</p>
					</div>
				</>
			);

			return (
				<div
					key={comment.id}
					className="group flex items-start gap-1 rounded-sm px-1.5 py-1 transition-colors hover:bg-accent/50"
				>
					{comment.url ? (
						<a
							href={comment.url}
							target="_blank"
							rel="noopener noreferrer"
							className="flex min-w-0 flex-1 items-start gap-2"
						>
							{content}
						</a>
					) : (
						<div className="flex min-w-0 flex-1 items-start gap-2">
							{content}
						</div>
					)}
					<div className="mt-0.5 flex shrink-0 flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
						{comment.url ? (
							<a
								href={comment.url}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
								aria-label="Open comment on GitHub"
							>
								<LuArrowUpRight className="size-3" />
							</a>
						) : null}
						<button
							type="button"
							className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							onClick={(event) => {
								event.preventDefault();
								event.stopPropagation();
								handleCopySingleComment(comment);
							}}
							aria-label={isCopied ? "Copied comment" : "Copy comment"}
						>
							{isCopied ? (
								<LuCheck className="size-3" />
							) : (
								<LuCopy className="size-3" />
							)}
						</button>
					</div>
				</div>
			);
		});

	const renderCommentSection = ({
		title,
		comments,
		isOpen,
		onOpenChange,
		action,
	}: {
		title: string;
		comments: PullRequestComment[];
		isOpen: boolean;
		onOpenChange: (open: boolean) => void;
		action?: ReactNode;
	}) => (
		<Collapsible
			open={isOpen}
			onOpenChange={onOpenChange}
			className="min-w-0 overflow-hidden"
		>
			<div className="group flex min-w-0 items-center">
				<CollapsibleTrigger
					className={cn(
						"flex w-full min-w-0 items-center gap-1.5 px-1.5 py-1 text-left",
						"hover:bg-accent/30 cursor-pointer transition-colors",
					)}
				>
					<VscChevronRight
						className={cn(
							"size-3 text-muted-foreground shrink-0 transition-transform duration-150",
							isOpen && "rotate-90",
						)}
					/>
					<span className="text-xs font-medium truncate">{title}</span>
					<span className="text-[10px] text-muted-foreground shrink-0">
						{comments.length}
					</span>
				</CollapsibleTrigger>
				{action ? <div className="mr-1 shrink-0">{action}</div> : null}
			</div>
			<CollapsibleContent className="min-w-0 overflow-hidden">
				{renderCommentList(comments)}
			</CollapsibleContent>
		</Collapsible>
	);

	return (
		<div className="flex h-full min-h-0 flex-col overflow-y-auto">
			<div className="border-b border-border/70 px-2 py-2">
				<div className="flex items-center gap-1.5">
					<PRIcon state={pr.state} className="size-4 shrink-0" />
					<a
						href={pr.url}
						target="_blank"
						rel="noopener noreferrer"
						className="min-w-0 flex-1 truncate text-xs font-medium text-foreground hover:underline"
						title={pr.title}
					>
						{pr.title}
					</a>
					<span className="shrink-0 font-mono text-[10px] text-muted-foreground">
						#{pr.number}
					</span>
				</div>

				<div className="mt-1.5 flex items-center gap-1.5">
					<span
						className={cn(
							"shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
							reviewDecisionConfig[pr.reviewDecision].className,
						)}
					>
						{reviewDecisionConfig[pr.reviewDecision].label}
					</span>
					<span className="truncate text-[10px] text-muted-foreground">
						{requestedReviewers.length > 0
							? reviewLabel
							: prStateLabel[pr.state]}
					</span>
				</div>
			</div>

			<Collapsible open={checksOpen} onOpenChange={setChecksOpen}>
				<CollapsibleTrigger
					className={cn(
						"group flex w-full min-w-0 items-center justify-between gap-2 px-2 py-1 text-left",
						"hover:bg-accent/50 cursor-pointer transition-colors",
					)}
				>
					<div className="flex min-w-0 items-center gap-1.5">
						<VscChevronRight
							className={cn(
								"size-3 text-muted-foreground shrink-0 transition-transform duration-150",
								checksOpen && "rotate-90",
							)}
						/>
						<span className="text-xs font-medium truncate">Checks</span>
						<span className="text-[10px] text-muted-foreground shrink-0">
							{relevantChecks.length}
						</span>
					</div>
					<div
						className={cn(
							"shrink-0 flex items-center gap-1",
							checksStatusConfig.className,
						)}
					>
						<ChecksStatusIcon
							className={cn(
								"size-3.5 shrink-0",
								checksStatus === "pending" && "animate-spin",
							)}
						/>
						<span className="max-w-[140px] truncate text-[10px] normal-case">
							{checksSummary}
						</span>
					</div>
				</CollapsibleTrigger>
				<CollapsibleContent className="min-w-0 px-0.5 pb-1 overflow-hidden">
					{relevantChecks.length === 0 ? (
						<div className="px-1.5 py-1 text-xs text-muted-foreground">
							No active checks reported for this pull request yet.
						</div>
					) : (
						relevantChecks.map((check) => {
							const { icon: CheckIcon, className } =
								checkIconConfig[check.status];
							const checkUrl = resolveCheckDestinationUrl(check, pr.url);

							return checkUrl ? (
								<a
									key={check.name}
									href={checkUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="group block"
								>
									<div className="flex min-w-0 items-center gap-1 rounded-sm px-1.5 py-1 text-xs transition-colors hover:bg-accent/50">
										<CheckIcon
											className={cn(
												"size-3 shrink-0",
												className,
												check.status === "pending" && "animate-spin",
											)}
										/>
										<div className="flex min-w-0 flex-1 items-center gap-1">
											<span className="min-w-0 truncate">{check.name}</span>
											<LuArrowUpRight className="size-3.5 shrink-0 text-muted-foreground/70 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
										</div>
										{check.durationText && (
											<span className="shrink-0 text-[10px] text-muted-foreground">
												{check.durationText}
											</span>
										)}
									</div>
								</a>
							) : (
								<div
									key={check.name}
									className="flex min-w-0 items-center gap-1 rounded-sm px-1.5 py-1 text-xs"
								>
									<CheckIcon
										className={cn(
											"size-3 shrink-0",
											className,
											check.status === "pending" && "animate-spin",
										)}
									/>
									<span className="min-w-0 flex-1 truncate">{check.name}</span>
									{check.durationText && (
										<span className="shrink-0 text-[10px] text-muted-foreground">
											{check.durationText}
										</span>
									)}
								</div>
							);
						})
					)}
				</CollapsibleContent>
			</Collapsible>

			<Collapsible
				open={commentsOpen}
				onOpenChange={setCommentsOpen}
				className="min-w-0"
			>
				<div className="group flex min-w-0 items-center">
					<CollapsibleTrigger
						className={cn(
							"flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left",
							"hover:bg-accent/50 cursor-pointer transition-colors",
						)}
					>
						<VscChevronRight
							className={cn(
								"size-3 text-muted-foreground shrink-0 transition-transform duration-150",
								commentsOpen && "rotate-90",
							)}
						/>
						<span className="text-xs font-medium truncate">Comments</span>
						<span className="text-[10px] text-muted-foreground shrink-0">
							{commentsCountLabel}
						</span>
					</CollapsibleTrigger>
				</div>
				<CollapsibleContent className="min-w-0 overflow-hidden">
					<div className="px-0.5 py-1">
						{isCommentsLoading ? (
							<div className="space-y-1 px-1">
								<Skeleton className="h-11 w-full rounded-sm" />
								<Skeleton className="h-11 w-full rounded-sm" />
								<Skeleton className="h-11 w-full rounded-sm" />
							</div>
						) : comments.length === 0 ? (
							<div className="px-1.5 py-1.5 text-xs text-muted-foreground">
								No comments yet.
							</div>
						) : (
							<>
								{activeComments.length > 0
									? renderCommentSection({
											title: "Open",
											comments: activeComments,
											isOpen: openCommentsGroupOpen,
											onOpenChange: setOpenCommentsGroupOpen,
											action: (
												<button
													type="button"
													className="flex items-center gap-1 rounded-sm px-1.5 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
													onClick={(event) => {
														event.preventDefault();
														event.stopPropagation();
														handleCopyCommentsList();
													}}
												>
													{copiedActionKey === ALL_COMMENTS_COPY_ACTION_KEY ? (
														<LuCheck className="size-3" />
													) : (
														<LuCopy className="size-3" />
													)}
													<span>{copyAllCommentsLabel}</span>
												</button>
											),
										})
									: null}
								{resolvedComments.length > 0 ? (
									<div className="pt-1">
										{renderCommentSection({
											title: "Resolved",
											comments: resolvedComments,
											isOpen: resolvedCommentsGroupOpen,
											onOpenChange: setResolvedCommentsGroupOpen,
										})}
									</div>
								) : null}
							</>
						)}
					</div>
				</CollapsibleContent>
			</Collapsible>
		</div>
	);
}
