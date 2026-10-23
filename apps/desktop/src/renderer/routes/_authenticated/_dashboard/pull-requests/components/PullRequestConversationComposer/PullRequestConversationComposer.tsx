import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { ArrowUp, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { useInvalidatePullRequestDetail } from "../../hooks/usePullRequestDetail";
import type { PullRequestReplyTarget } from "../../providers/PullRequestActivityReplyProvider";
import { pullRequestAuthorLabel } from "../../utils/pullRequestAuthorLabel";
import {
	addPullRequestComment,
	type PullRequestTarget,
	replyToPullRequestThread,
} from "../../utils/pullRequestClient";

export type PullRequestCommentTarget = PullRequestTarget;

interface PullRequestConversationComposerProps {
	target: PullRequestCommentTarget;
	/** A review-thread comment to answer instead of the conversation. */
	replyTo?: PullRequestReplyTarget | null;
	onCancelReply?: () => void;
}

/** The "Leave a comment" card at the end of the Activity section. Posts as the viewer;
 *  Enter sends, Shift+Enter breaks a line (comments accept markdown). With a reply
 *  target it answers that review thread instead. */
export function PullRequestConversationComposer({
	target,
	replyTo = null,
	onCancelReply,
}: PullRequestConversationComposerProps) {
	const { t } = useLingui();
	// One draft per destination: choosing a thread to reply to must not carry
	// a half-written conversation comment along, and cancelling the reply
	// brings that comment back.
	const [drafts, setDrafts] = useState({ conversation: "", reply: "" });
	const body = replyTo ? drafts.reply : drafts.conversation;
	const setBody = (text: string) =>
		setDrafts((current) =>
			replyTo
				? { ...current, reply: text }
				: { ...current, conversation: text },
		);
	const fieldRef = useRef<HTMLTextAreaElement>(null);
	// mutation.isPending updates on React's schedule, too late to stop a
	// rapid double Enter from posting twice.
	const submittingRef = useRef(false);
	const invalidate = useInvalidatePullRequestDetail(target);
	const replyCommentId = replyTo?.commentId;
	useEffect(() => {
		setDrafts((current) => ({ ...current, reply: "" }));
		if (replyCommentId !== undefined) fieldRef.current?.focus();
	}, [replyCommentId]);
	const post = useMutation({
		mutationFn: (text: string) =>
			replyTo
				? replyToPullRequestThread(target, {
						commentId: replyTo.commentId,
						body: text,
					})
				: addPullRequestComment(target, text),
		onSuccess: () => {
			setBody("");
			onCancelReply?.();
			void invalidate();
		},
		onError: (error) => {
			toast.error(
				replyTo
					? t({ message: "Couldn't post reply" })
					: t({ message: "Couldn't post comment" }),
				{ description: errorMessage(error) },
			);
		},
	});
	const trimmed = body.trim();
	const canSubmit = trimmed.length > 0 && !post.isPending;
	const submit = () => {
		if (!canSubmit || submittingRef.current) return;
		submittingRef.current = true;
		post.mutate(trimmed, {
			onSettled: () => {
				submittingRef.current = false;
			},
		});
	};
	const placeholder = replyTo
		? t({ message: "Write a reply" })
		: t({ message: "Leave a comment" });
	const replyingTo = replyTo ? pullRequestAuthorLabel(replyTo.author) : null;
	return (
		<div className="rounded-xl border border-border/60 bg-background shadow-sm">
			{replyingTo ? (
				<div className="flex items-center gap-2 px-3 pt-2 text-[11px] text-muted-foreground">
					<span className="min-w-0 truncate">
						<Trans>Replying to {replyingTo}</Trans>
					</span>
					<button
						type="button"
						aria-label={t({ message: "Cancel reply" })}
						onClick={onCancelReply}
						className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<X className="size-3" />
					</button>
				</div>
			) : null}
			<textarea
				ref={fieldRef}
				rows={Math.max(3, Math.min(8, body.split("\n").length))}
				value={body}
				disabled={post.isPending}
				placeholder={placeholder}
				aria-label={placeholder}
				onChange={(event) => setBody(event.target.value)}
				onKeyDown={(event) => {
					if (
						event.key === "Enter" &&
						!event.shiftKey &&
						!event.nativeEvent.isComposing
					) {
						event.preventDefault();
						submit();
					}
				}}
				className="block w-full resize-none bg-transparent px-3 pt-3 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
			/>
			<div className="flex items-center justify-end gap-1.5 px-2 pb-2">
				<span
					className="mr-auto flex items-center gap-1.5 pl-1 text-[11px] text-muted-foreground"
					title={t({ message: "Commenting as your GitHub account" })}
				>
					<FaGithub className="size-3" />
				</span>
				<button
					type="button"
					disabled={!canSubmit}
					aria-label={
						replyTo
							? t({ message: "Post reply" })
							: t({ message: "Post comment" })
					}
					onClick={submit}
					className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/60 text-foreground transition-colors hover:bg-muted disabled:opacity-40"
				>
					<ArrowUp strokeWidth={2.25} className="size-4" />
				</button>
			</div>
		</div>
	);
}
