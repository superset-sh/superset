"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { getInitials } from "@superset/shared/names";
import { Bot, Check, Loader2, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "../../../../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../../../ui/avatar";
import { Button } from "../../../ui/button";
import { Textarea } from "../../../ui/textarea";
import {
	type CommentThread,
	type PageComment,
	useComments,
} from "../../providers/CommentProvider";
import { commentAuthor } from "../../utils/commentAuthor";
import { isOptimisticId } from "../../utils/optimisticId";
import { relativeTime } from "../../utils/relativeTime";
import { Quote } from "./components/Quote";

interface CommentListProps {
	thread: CommentThread;
	anchorText?: string;
	onAnchorClick?: () => void;
	onEdit?: (commentId: string, body: string) => void | Promise<void>;
	onToggleResolved?: () => void;
	onDelete?: () => void;
	className?: string;
}

export function CommentList({
	thread,
	anchorText,
	onAnchorClick,
	onEdit,
	onToggleResolved,
	onDelete,
	className,
}: CommentListProps) {
	const { t } = useLingui();
	const { submitting, busyThreadId, canEdit, canDeleteThread } = useComments();
	// Nothing here can address a row the server has not created yet: its id is
	// synthetic, and every one of these controls sends an id.
	const pending = isOptimisticId(thread.id);
	const deletable = !pending && canDeleteThread(thread);
	const threadBusy = busyThreadId === thread.id;
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editValue, setEditValue] = useState("");

	const commitEdit = async (comment: PageComment) => {
		const body = editValue.trim();
		if (!body || !onEdit) {
			setEditingId(null);
			return;
		}
		try {
			await onEdit(comment.id, body);
			setEditingId(null);
		} catch {}
	};

	return (
		<div className={cn("flex flex-col", className)}>
			{thread.comments.map((comment, index) => {
				const author = commentAuthor(comment);
				return (
					<div
						key={comment.id}
						className="group/comment flex gap-2 px-3 pb-1.5 first:pt-3 last:pb-3"
					>
						<Avatar className="size-6 shrink-0">
							<AvatarImage src={author.image ?? undefined} alt="" />
							<AvatarFallback className="text-[10px]">
								{author.isAgent ? (
									<Bot className="size-3" />
								) : (
									getInitials(author.name) || "?"
								)}
							</AvatarFallback>
						</Avatar>

						<div className="flex min-w-0 flex-1 flex-col gap-0.5">
							<div className="flex min-h-6 items-center gap-2">
								<div className="flex min-w-0 items-baseline gap-2">
									<span className="truncate font-medium text-sm">
										{author.name}
									</span>
									<span className="truncate text-muted-foreground text-xs">
										{relativeTime(comment.createdAt)}
									</span>
								</div>
								<div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/comment:opacity-100">
									{onEdit && !isOptimisticId(comment.id) && canEdit(comment) ? (
										<IconButton
											label={t({ message: "Edit comment" })}
											onClick={() => {
												setEditingId(comment.id);
												setEditValue(comment.body);
											}}
										>
											<Pencil className="size-3.5" />
										</IconButton>
									) : null}
									{onToggleResolved && !pending ? (
										<IconButton
											label={
												thread.resolved
													? t({ message: "Reopen thread" })
													: t({ message: "Resolve thread" })
											}
											onClick={onToggleResolved}
											disabled={threadBusy}
										>
											{thread.resolved ? (
												<RotateCcw className="size-3.5" />
											) : (
												<Check className="size-3.5" />
											)}
										</IconButton>
									) : null}
									{onDelete && deletable ? (
										<IconButton
											label={t({ message: "Delete thread" })}
											onClick={onDelete}
											disabled={threadBusy}
										>
											{threadBusy ? (
												<Loader2 className="size-3.5 animate-spin" />
											) : (
												<Trash2 className="size-3.5" />
											)}
										</IconButton>
									) : null}
								</div>
							</div>
							{index === 0 && anchorText ? (
								<Quote onClick={onAnchorClick}>{anchorText}</Quote>
							) : null}
							{editingId === comment.id ? (
								<div className="flex flex-col gap-2">
									<Textarea
										value={editValue}
										onChange={(event) => setEditValue(event.target.value)}
										className="min-h-16 resize-none rounded-[13px] border-[0.5px] bg-foreground/[0.02] p-2.5 text-sm shadow-none focus-visible:ring-0 dark:bg-foreground/[0.02]"
									/>
									<div className="flex gap-2">
										<Button
											size="sm"
											onClick={() => commitEdit(comment)}
											disabled={submitting}
										>
											{submitting ? (
												<>
													<Loader2 className="size-3.5 animate-spin" />
													<Trans>Saving…</Trans>
												</>
											) : (
												<Trans>Save</Trans>
											)}
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => setEditingId(null)}
											disabled={submitting}
										>
											<Trans>Cancel</Trans>
										</Button>
									</div>
								</div>
							) : (
								<p className="whitespace-pre-wrap text-sm">{comment.body}</p>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}

function IconButton({
	label,
	onClick,
	disabled,
	children,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	children: ReactNode;
}) {
	return (
		<Button
			type="button"
			size="icon-xs"
			variant="ghost"
			aria-label={label}
			title={label}
			onClick={onClick}
			disabled={disabled}
			className="size-6 text-muted-foreground hover:text-foreground"
		>
			{children}
		</Button>
	);
}
