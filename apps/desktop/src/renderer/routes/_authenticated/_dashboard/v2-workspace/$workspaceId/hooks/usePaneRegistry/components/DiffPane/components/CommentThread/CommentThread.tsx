import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { errorMessage } from "@superset/i18n/errors";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Button } from "@superset/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { useEffect, useState } from "react";
import {
	LuCheck,
	LuChevronRight,
	LuCopy,
	LuExternalLink,
	LuLoaderCircle,
} from "react-icons/lu";
import { CommentMarkdown } from "renderer/components/CommentMarkdown";
import { ReviewThreadReplyComposer } from "renderer/routes/_authenticated/_dashboard/components/ReviewThreadReplyComposer";
import "./comment-thread.css";
import { msg } from "@lingui/core/macro";

interface Comment {
	id: string;
	authorLogin: string;
	avatarUrl?: string;
	body: string;
	createdAt?: number;
}

interface CommentThreadProps {
	workspaceId: string;
	threadId: string;
	isResolved: boolean;
	isOutdated?: boolean;
	url?: string;
	comments: Comment[];
	/** REST databaseId of a comment already in the thread — replies thread
	 *  onto it regardless of which comment they target. Undefined only if
	 *  GitHub ever returns a thread with zero comments (shouldn't happen). */
	replyToCommentId?: number;
	/** Force-expand the bubble whenever this changes — lets jump-to-line
	 *  reveal a collapsed (resolved/outdated) thread. */
	focusTick?: number;
}

export function CommentThread({
	workspaceId,
	threadId,
	isResolved,
	isOutdated,
	url,
	comments,
	replyToCommentId,
	focusTick,
}: CommentThreadProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(!isResolved && !isOutdated);
	const [isCopied, setIsCopied] = useState(false);
	useEffect(() => {
		if (!isCopied) return;
		const timer = setTimeout(() => setIsCopied(false), 2000);
		return () => clearTimeout(timer);
	}, [isCopied]);
	const handleCopy = (e: React.MouseEvent) => {
		e.stopPropagation();
		const text =
			comments.length === 1
				? comments[0].body
				: comments.map((c) => `@${c.authorLogin}:\n${c.body}`).join("\n\n");
		navigator.clipboard
			.writeText(text)
			.then(() => setIsCopied(true))
			.catch((err) => {
				console.error("[CommentThread/copy] Failed to copy:", err);
				toast.error(
					t({
						message: "Couldn't copy comment",
					}),
				);
			});
	};
	// Auto-collapse on resolve/outdated (matches GitHub).
	useEffect(() => {
		if (isResolved || isOutdated) setOpen(false);
	}, [isResolved, isOutdated]);
	// Force-expand when the reviewer jumps to this line, even if it was
	// collapsed for being resolved or outdated.
	useEffect(() => {
		if (focusTick != null) setOpen(true);
	}, [focusTick]);
	const utils = workspaceTrpc.useUtils();
	const setResolution = workspaceTrpc.git.setReviewThreadResolution.useMutation(
		{
			onSuccess: () => {
				void utils.git.getPullRequestThreads.invalidate({ workspaceId });
			},
			onError: (error) => {
				toast.error(
					t({
						message: "Couldn't update thread",
					}),
					{
						description: errorMessage(error),
					},
				);
			},
		},
	);
	const [replyText, setReplyText] = useState("");
	const replyToThread = workspaceTrpc.git.replyToReviewThread.useMutation({
		onSuccess: () => {
			void utils.git.getPullRequestThreads.invalidate({ workspaceId });
		},
		onError: (error, variables) => {
			// The draft is cleared as soon as it's sent; hand it back so a
			// rejected reply isn't retyped — unless a new one is already
			// underway.
			setReplyText((current) => (current.trim() ? current : variables.body));
			toast.error(
				t({
					message: "Couldn't post reply",
				}),
				{
					description: errorMessage(error),
				},
			);
		},
	});

	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className={cn(
				"diff-comment mx-3 my-1 overflow-hidden rounded-md border border-border bg-card text-card-foreground",
				isResolved && "opacity-70",
			)}
		>
			<div className="flex items-center gap-2 px-2.5 py-1.5">
				<CollapsibleTrigger
					className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none"
					aria-label={
						open
							? t({
									message: "Collapse thread",
								})
							: t({
									message: "Expand thread",
								})
					}
				>
					<LuChevronRight
						className={cn(
							"size-3 shrink-0 transition-transform",
							open && "rotate-90",
						)}
					/>
					<span className="shrink-0">
						<Plural
							value={comments.length}
							one="# comment"
							other="# comments"
						/>
					</span>
					{isOutdated && (
						<span className="shrink-0 rounded-sm border border-border px-1 py-px text-[10px] font-medium uppercase tracking-wide">
							<Trans>Outdated</Trans>
						</span>
					)}
					{isResolved && (
						<span className="shrink-0 rounded-sm border border-border px-1 py-px text-[10px] font-medium uppercase tracking-wide">
							<Trans>Resolved</Trans>
						</span>
					)}
				</CollapsibleTrigger>
				<button
					type="button"
					onClick={handleCopy}
					className="shrink-0 text-muted-foreground hover:text-foreground"
					aria-label={
						isCopied
							? t({ message: "Copied" })
							: comments.length === 1
								? t({
										message: "Copy comment",
									})
								: t({
										message: "Copy comments",
									})
					}
				>
					{isCopied ? (
						<LuCheck className="size-3 text-green-500" />
					) : (
						<LuCopy className="size-3" />
					)}
				</button>
				{url && (
					<a
						href={url}
						target="_blank"
						rel="noreferrer"
						onClick={(e) => e.stopPropagation()}
						className="shrink-0 text-muted-foreground hover:text-foreground"
						aria-label={t({
							message: "Open on GitHub",
						})}
					>
						<LuExternalLink className="size-3" />
					</a>
				)}
			</div>
			<CollapsibleContent className="overflow-hidden border-t border-border data-[state=closed]:animate-none">
				<ul className="divide-y divide-border">
					{comments.map((comment) => (
						<CommentRow key={comment.id} comment={comment} />
					))}
				</ul>
				<ReviewThreadReplyComposer
					value={replyText}
					onChange={setReplyText}
					onReply={(body) => {
						if (replyToCommentId == null) return false;
						replyToThread.mutate({
							workspaceId,
							commentId: replyToCommentId,
							body,
						});
						return true;
					}}
					isPending={replyToThread.isPending}
					className="border-border bg-muted/30 px-2.5"
					actions={
						<Button
							type="button"
							size="xs"
							variant="outline"
							disabled={setResolution.isPending}
							onClick={() =>
								setResolution.mutate({
									workspaceId,
									threadId,
									resolved: !isResolved,
								})
							}
						>
							{setResolution.isPending && (
								<LuLoaderCircle className="size-3 animate-spin" />
							)}
							{isResolved ? (
								<Trans>Unresolve</Trans>
							) : (
								<Trans>Resolve conversation</Trans>
							)}
						</Button>
					}
				/>
			</CollapsibleContent>
		</Collapsible>
	);
}

function CommentRow({ comment }: { comment: Comment }) {
	return (
		<li className="flex gap-2 px-2.5 py-2">
			<Avatar className="mt-0.5 size-5 shrink-0">
				{comment.avatarUrl ? (
					<AvatarImage src={comment.avatarUrl} alt={comment.authorLogin} />
				) : null}
				<AvatarFallback className="text-[10px]">
					{comment.authorLogin.slice(0, 1).toUpperCase()}
				</AvatarFallback>
			</Avatar>
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline gap-2 text-xs">
					<span className="font-medium text-foreground">
						{comment.authorLogin}
					</span>
					{comment.createdAt != null && (
						<time
							className="text-muted-foreground"
							dateTime={new Date(comment.createdAt).toISOString()}
						>
							{formatRelative(comment.createdAt)}
						</time>
					)}
				</div>
				<div className="diff-comment-body mt-1">
					<CommentMarkdown body={comment.body} />
				</div>
			</div>
		</li>
	);
}

function formatRelative(ms: number): string {
	// Floor (not round) so a 30-minute comment doesn't read "1h ago".
	// Clamp >=0 so future-dated timestamps from clock skew aren't negative.
	const delta = Math.max(0, Date.now() - ms);
	const seconds = Math.floor(delta / 1000);
	if (seconds < 60)
		return i18n._({
			...msg({
				message: "{seconds}s ago",
			}),
			values: { seconds },
		});
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60)
		return i18n._({
			...msg({
				message: "{minutes}m ago",
			}),
			values: { minutes },
		});
	const hours = Math.floor(minutes / 60);
	if (hours < 24)
		return i18n._({
			...msg({
				message: "{hours}h ago",
			}),
			values: { hours },
		});
	const days = Math.floor(hours / 24);
	if (days < 30)
		return i18n._({
			...msg({
				message: "{days}d ago",
			}),
			values: { days },
		});
	const months = Math.floor(days / 30);
	if (months < 12)
		return i18n._({
			...msg({
				message: "{months}mo ago",
			}),
			values: { months },
		});
	const years = Math.floor(days / 365);
	return i18n._({
		...msg({
			message: "{years}y ago",
		}),
		values: { years },
	});
}
