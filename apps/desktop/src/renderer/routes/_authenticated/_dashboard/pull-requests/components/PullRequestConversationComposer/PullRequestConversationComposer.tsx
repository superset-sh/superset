import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { ArrowUp } from "lucide-react";
import { useRef, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useInvalidatePullRequestDetail } from "../../hooks/usePullRequestDetail";

export interface PullRequestCommentTarget {
	projectId: string;
	hostUrl: string;
	prNumber: number;
}

interface PullRequestConversationComposerProps {
	target: PullRequestCommentTarget;
}

/** The "Leave a comment" pill under the conversation. Posts as the gh user;
 *  Enter sends, Shift+Enter breaks a line (comments accept markdown). */
export function PullRequestConversationComposer({
	target,
}: PullRequestConversationComposerProps) {
	const { t } = useLingui();
	const [body, setBody] = useState("");
	// mutation.isPending updates on React's schedule, too late to stop a
	// rapid double Enter from posting twice.
	const submittingRef = useRef(false);
	const invalidate = useInvalidatePullRequestDetail(target);
	const post = useMutation({
		mutationFn: (text: string) =>
			getHostServiceClientByUrl(target.hostUrl).pullRequests.addComment.mutate({
				projectId: target.projectId,
				prNumber: target.prNumber,
				body: text,
			}),
		onSuccess: () => {
			setBody("");
			void invalidate();
		},
		onError: (error) => {
			toast.error(t({ message: "Couldn't post comment" }), {
				description: errorMessage(error),
			});
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
	const placeholder = t({ message: "Leave a comment" });
	return (
		<div className="flex items-center gap-2 rounded-3xl border border-border/60 bg-background py-1 pl-3 pr-1.5 shadow-sm">
			<span
				className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
				title={t({ message: "Commenting as your GitHub account" })}
			>
				<FaGithub className="size-3" />
			</span>
			<textarea
				rows={Math.min(6, body.split("\n").length)}
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
				className="min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
			/>
			<button
				type="button"
				disabled={!canSubmit}
				aria-label={t({ message: "Post comment" })}
				onClick={submit}
				className="flex size-7 shrink-0 items-center justify-center self-end rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-35"
			>
				<ArrowUp strokeWidth={2.25} className="size-4" />
			</button>
		</div>
	);
}
