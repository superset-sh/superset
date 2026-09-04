"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import {
	Bot,
	Check,
	Loader2,
	Pencil,
	RotateCcw,
	SendHorizontal,
	Trash2,
} from "lucide-react";
import {
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { cn } from "../../../../../../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../../../../../ui/avatar";
import { Button } from "../../../../../ui/button";
import { Textarea } from "../../../../../ui/textarea";
import {
	type CommentThread,
	type PageComment,
	useComments,
} from "../../../../providers/CommentProvider";
import { commentAuthor } from "../../../../utils/commentAuthor";
import { relativeTime } from "../../../../utils/relativeTime";
import type { PinPoint } from "../../utils/pinLayout";
import { popoverPlacement } from "./utils/popoverLayout";

/** Stand-in until the card has rendered and can be measured. */
const ESTIMATED_HEIGHT = 200;

export function initialsOf(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	const first = parts[0];
	const last = parts[parts.length - 1];
	if (!first || !last) return "?";
	if (parts.length === 1) return first.slice(0, 2).toUpperCase();
	return (first.slice(0, 1) + last.slice(0, 1)).toUpperCase();
}

interface CommentPopoverProps {
	/**
	 * The thread's pin. The card hangs off the pin rather than off the element,
	 * so a pin dropped in the middle of a tall block — a chart, a long section —
	 * does not open a card the height of that block away from it.
	 */
	point: PinPoint;
	container: { width: number; height: number };
	thread: CommentThread | null;
	onSubmit: (body: string) => void | Promise<void>;
	onEdit?: (commentId: string, body: string) => void | Promise<void>;
	onToggleResolved?: () => void;
	onDelete?: () => void;
	onDismiss: () => void;
}

export function CommentPopover({
	point,
	container,
	thread,
	onSubmit,
	onEdit,
	onToggleResolved,
	onDelete,
	onDismiss,
}: CommentPopoverProps) {
	const { t } = useLingui();
	const { submitting, busyThreadId } = useComments();
	const threadBusy = thread !== null && busyThreadId === thread.id;
	const [value, setValue] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [composerFocused, setComposerFocused] = useState(false);
	const composerOpen = composerFocused || value.trim().length > 0;
	const [editValue, setEditValue] = useState("");
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const cardRef = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState(ESTIMATED_HEIGHT);

	useEffect(() => {
		if (thread) return;
		inputRef.current?.focus();
	}, [thread]);

	// A thread with replies is far taller than a fresh draft, and the height
	// decides whether the card can hang below the pin or has to flip above it.
	useLayoutEffect(() => {
		const card = cardRef.current;
		if (!card) return;
		const observer = new ResizeObserver(() => setHeight(card.offsetHeight));
		observer.observe(card);
		setHeight(card.offsetHeight);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const onPointerDown = (event: PointerEvent) => {
			if (submitting) return;
			const target = event.target as HTMLElement | null;
			if (cardRef.current?.contains(target)) return;
			if (target?.closest("[data-comment-ui]")) return;
			onDismiss();
		};
		document.addEventListener("pointerdown", onPointerDown, true);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown, true);
		};
	}, [onDismiss, submitting]);

	const { left, top, width } = popoverPlacement({ point, container, height });

	const submit = async () => {
		const body = value.trim();
		if (!body || submitting) return;
		try {
			await onSubmit(body);
			setValue("");
		} catch {}
	};

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
		<div
			ref={cardRef}
			data-comment-ui=""
			style={{ transform: `translate(${left}px, ${top}px)`, width }}
			className="pointer-events-auto absolute top-0 left-0 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
		>
			{thread ? (
				<div className="flex max-h-72 flex-col overflow-y-auto">
					{thread.comments.map((comment) => (
						<div
							key={comment.id}
							className={cn(
								"group/comment flex flex-col gap-1 px-3.5 py-2 first:pt-3.5 last:pb-3.5",
							)}
						>
							<div className="flex h-7 items-center gap-2.5">
								<Avatar className="size-7">
									<AvatarImage
										src={commentAuthor(comment).image ?? undefined}
										alt=""
									/>
									<AvatarFallback className="text-[11px]">
										{commentAuthor(comment).isAgent ? (
											<Bot className="size-3.5" />
										) : (
											initialsOf(commentAuthor(comment).name)
										)}
									</AvatarFallback>
								</Avatar>
								<div className="flex min-w-0 items-baseline gap-2">
									<span className="truncate font-medium text-sm">
										{commentAuthor(comment).name}
									</span>
									<span className="truncate text-muted-foreground text-xs">
										{relativeTime(comment.createdAt)}
									</span>
								</div>
								{/* Actions stay out of the way until the comment is hovered
								    or focused, so a thread reads as prose. */}
								<div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/comment:opacity-100">
									<IconButton
										label={t({
											message: "Edit comment",
										})}
										onClick={() => {
											setEditingId(comment.id);
											setEditValue(comment.body);
										}}
									>
										<Pencil className="size-3.5" />
									</IconButton>
									{onToggleResolved ? (
										<IconButton
											label={
												thread.resolved
													? t({
															message: "Reopen thread",
														})
													: t({
															message: "Resolve thread",
														})
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
									{onDelete ? (
										<IconButton
											label={t({
												message: "Delete thread",
											})}
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
							{editingId === comment.id ? (
								<div className="flex flex-col gap-2 pl-[38px]">
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
								<p className="whitespace-pre-wrap pl-[38px] text-sm">
									{comment.body}
								</p>
							)}
						</div>
					))}
				</div>
			) : null}

			<div className={cn("flex flex-col", thread && "border-t")}>
				<Textarea
					ref={inputRef}
					value={value}
					onChange={(event) => setValue(event.target.value)}
					onFocus={() => setComposerFocused(true)}
					onBlur={() => setComposerFocused(false)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							submit();
						}
					}}
					placeholder={
						thread
							? t({
									message: "Reply to thread…",
								})
							: t({
									message: "Write a comment…",
								})
					}
					className={cn(
						"resize-none rounded-none border-0 bg-transparent p-3.5 text-sm shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent",
						composerOpen ? "min-h-[68px]" : "min-h-11 py-3",
					)}
				/>
				{composerOpen ? (
					<div className="flex items-center gap-2.5 px-3.5 pb-3.5">
						<span className="text-muted-foreground text-xs">
							<Trans>⌘↵ to send</Trans>
						</span>
						<Button
							size="icon"
							className="ml-auto size-8 rounded-lg"
							onClick={submit}
							aria-label={
								thread
									? t({ message: "Send reply" })
									: t({
											message: "Post comment",
										})
							}
							disabled={submitting || value.trim().length === 0}
						>
							{submitting ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<SendHorizontal className="size-4" />
							)}
						</Button>
					</div>
				) : null}
			</div>
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
