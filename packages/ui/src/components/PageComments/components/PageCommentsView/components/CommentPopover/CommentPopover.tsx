"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../../../../../lib/utils";
import {
	type CommentThread,
	useComments,
} from "../../../../providers/CommentProvider";
import { isOptimisticId } from "../../../../utils/optimisticId";
import { CommentComposer } from "../../../CommentComposer";
import { CommentList } from "../../../CommentList";
import type { PinPoint } from "../../utils/pinLayout";
import { popoverPlacement } from "./utils/popoverLayout";

/** Stand-in until the card has rendered and can be measured. */
const ESTIMATED_HEIGHT = 200;

interface CommentPopoverProps {
	/**
	 * The thread's pin. The card hangs off the pin rather than off the element,
	 * so a pin dropped in the middle of a tall block — a chart, a long section —
	 * does not open a card the height of that block away from it.
	 */
	point: PinPoint;
	container: { width: number; height: number };
	thread: CommentThread | null;
	initialValue?: string;
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
	initialValue,
	onSubmit,
	onEdit,
	onToggleResolved,
	onDelete,
	onDismiss,
}: CommentPopoverProps) {
	const { submitting } = useComments();
	const cardRef = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState(ESTIMATED_HEIGHT);

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

	return (
		<div
			ref={cardRef}
			data-comment-ui=""
			style={{ transform: `translate(${left}px, ${top}px)`, width }}
			className="pointer-events-auto absolute top-0 left-0 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
		>
			{thread ? (
				<CommentList
					thread={thread}
					onEdit={onEdit}
					onToggleResolved={onToggleResolved}
					onDelete={onDelete}
					className="max-h-72 overflow-y-auto"
				/>
			) : null}

			{thread && isOptimisticId(thread.id) ? null : (
				<CommentComposer
					isReply={thread !== null}
					autoFocus={thread === null}
					initialValue={initialValue}
					onSubmit={onSubmit}
					className={cn(thread && "border-t")}
				/>
			)}
		</div>
	);
}
