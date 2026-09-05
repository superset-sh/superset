import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { LuLoaderCircle } from "react-icons/lu";

interface ReviewThreadReplyComposerProps {
	/** Controlled draft: the owner keeps it so it can hand the text back
	 *  after a failed post. */
	value: string;
	onChange: (value: string) => void;
	/** Dispatches the trimmed body. Returns false when there is nothing to
	 *  reply onto (a thread without a comment id), which keeps the draft
	 *  and tells the reviewer; true clears it. */
	onReply: (body: string) => boolean;
	isPending?: boolean;
	/** Rendered before the Reply button, e.g. the resolve toggle. */
	actions?: ReactNode;
	/** Border, background, and horizontal padding of the footer, so each
	 *  diff surface keeps its own tint. */
	className?: string;
}

/**
 * Reply box under a review thread: a textarea that sends on Cmd/Ctrl+Enter
 * and a Reply button that stays disabled while the draft is blank or a post
 * is in flight. Shared by the workspace Changes pane and the PR view's Code
 * tab; the mutation itself belongs to the caller.
 */
export function ReviewThreadReplyComposer({
	value,
	onChange,
	onReply,
	isPending = false,
	actions,
	className,
}: ReviewThreadReplyComposerProps) {
	const { t } = useLingui();
	const body = value.trim();
	const submit = () => {
		if (!body || isPending) return;
		if (!onReply(body)) {
			toast.error(
				t({
					message: "Couldn't send reply",
				}),
				{
					description: t({
						message: "This thread has no comment to reply to.",
					}),
				},
			);
			return;
		}
		// Cleared as soon as the post is dispatched; a failure surfaces as a
		// toast from the caller's mutation, which may hand the draft back.
		onChange("");
	};

	return (
		<div className={cn("flex flex-col gap-2 border-t py-2", className)}>
			<Textarea
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={(e) => {
					if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
						e.preventDefault();
						submit();
					}
				}}
				placeholder={t({
					message: "Write a reply…",
				})}
				rows={2}
				className="resize-none bg-background text-xs"
			/>
			<div className="flex items-center justify-end gap-2">
				{actions}
				<Button
					type="button"
					size="xs"
					disabled={!body || isPending}
					onClick={submit}
				>
					{isPending && <LuLoaderCircle className="size-3 animate-spin" />}
					<Trans>Reply</Trans>
				</Button>
			</div>
		</div>
	);
}
