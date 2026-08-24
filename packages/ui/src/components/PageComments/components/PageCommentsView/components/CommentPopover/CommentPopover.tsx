"use client";

import { formatDistanceToNowStrict } from "date-fns";

import { Check, Loader2, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "../../../../../../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../../../../../ui/avatar";
import { Button } from "../../../../../ui/button";
import { Textarea } from "../../../../../ui/textarea";
import {
	type CommentThread,
	type PageComment,
	useComments,
} from "../../../../providers/CommentProvider";
import type { FrameRect } from "../../../../utils/commentRuntime";

const WIDTH = 340;
const GAP = 10;
const EDGE = 12;

export function initialsOf(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	const first = parts[0];
	const last = parts[parts.length - 1];
	if (!first || !last) return "?";
	if (parts.length === 1) return first.slice(0, 2).toUpperCase();
	return (first.slice(0, 1) + last.slice(0, 1)).toUpperCase();
}

interface CommentPopoverProps {
	rect: FrameRect;
	container: { width: number; height: number };
	thread: CommentThread | null;
	onSubmit: (body: string) => void | Promise<void>;
	onEdit?: (commentId: string, body: string) => void | Promise<void>;
	onToggleResolved?: () => void;
	onDelete?: () => void;
	onDismiss: () => void;
}

export function CommentPopover({
	rect,
	container,
	thread,
	onSubmit,
	onEdit,
	onToggleResolved,
	onDelete,
	onDismiss,
}: CommentPopoverProps) {
	const { user, submitting, busyThreadId } = useComments();
	const threadBusy = thread !== null && busyThreadId === thread.id;
	const [value, setValue] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editValue, setEditValue] = useState("");
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const cardRef = useRef<HTMLDivElement>(null);

	const name = user.name;
	const image = user.image;

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !submitting) onDismiss();
		};
		const onPointerDown = (event: PointerEvent) => {
			if (submitting) return;
			const target = event.target as HTMLElement | null;
			if (cardRef.current?.contains(target)) return;
			if (target?.closest("[data-comment-ui]")) return;
			onDismiss();
		};
		window.addEventListener("keydown", onKeyDown);
		document.addEventListener("pointerdown", onPointerDown, true);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("pointerdown", onPointerDown, true);
		};
	}, [onDismiss, submitting]);

	const below = rect.top + rect.height + GAP + 200 < container.height;
	const top = below
		? rect.top + rect.height + GAP
		: Math.max(EDGE, rect.top - GAP - 200);
	const left = Math.min(
		Math.max(EDGE, rect.left),
		Math.max(EDGE, container.width - WIDTH - EDGE),
	);

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
			style={{ transform: `translate(${left}px, ${top}px)`, width: WIDTH }}
			className="pointer-events-auto absolute top-0 left-0 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl"
		>
			{thread ? (
				<div className="flex max-h-64 flex-col gap-3 overflow-y-auto p-3">
					{thread.comments.map((comment) => (
						<div key={comment.id} className="flex flex-col gap-1.5">
							<div className="flex items-center gap-2">
								<Avatar className="size-6">
									<AvatarImage src={comment.authorImage ?? undefined} alt="" />
									<AvatarFallback className="text-[10px]">
										{initialsOf(comment.authorName)}
									</AvatarFallback>
								</Avatar>
								<span className="font-medium text-sm">
									{comment.authorName}
								</span>
								<span className="text-muted-foreground text-xs">
									{formatDistanceToNowStrict(comment.createdAt, {
										addSuffix: true,
									})}
								</span>
								<div className="ml-auto flex items-center gap-0.5">
									<IconButton
										label="Edit comment"
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
												thread.resolved ? "Reopen thread" : "Resolve thread"
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
											label="Delete thread"
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
								<div className="flex flex-col gap-2">
									<Textarea
										value={editValue}
										onChange={(event) => setEditValue(event.target.value)}
										className="min-h-16 text-sm"
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
													Saving…
												</>
											) : (
												"Save"
											)}
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => setEditingId(null)}
											disabled={submitting}
										>
											Cancel
										</Button>
									</div>
								</div>
							) : (
								<p className="whitespace-pre-wrap pl-8 text-sm">
									{comment.body}
								</p>
							)}
						</div>
					))}
				</div>
			) : (
				<div className="flex items-center gap-2 border-b px-3 py-2.5">
					<Avatar className="size-6">
						<AvatarImage src={image ?? undefined} alt="" />
						<AvatarFallback className="text-[10px]">
							{initialsOf(name)}
						</AvatarFallback>
					</Avatar>
					<span className="font-medium text-sm">{name}</span>
					<span className="text-muted-foreground text-xs">new comment</span>
				</div>
			)}

			<div className={cn("flex flex-col gap-2 p-3", thread && "border-t")}>
				<Textarea
					ref={inputRef}
					value={value}
					onChange={(event) => setValue(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							submit();
						}
					}}
					placeholder={thread ? "Reply…" : "Add a comment…"}
					className="min-h-16 resize-none text-sm"
				/>
				<div className="flex items-center gap-2">
					<Button
						size="sm"
						onClick={submit}
						disabled={submitting || value.trim().length === 0}
					>
						{submitting ? (
							<>
								<Loader2 className="size-3.5 animate-spin" />
								{thread ? "Replying…" : "Posting…"}
							</>
						) : thread ? (
							"Reply"
						) : (
							"Comment"
						)}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={onDismiss}
						disabled={submitting}
					>
						Cancel
					</Button>
					<span className="ml-auto text-muted-foreground text-xs">⌘↵</span>
				</div>
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
