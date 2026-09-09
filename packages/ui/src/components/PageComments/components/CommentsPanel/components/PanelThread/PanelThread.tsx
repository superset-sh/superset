"use client";

import { Plural } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../../../../../lib/utils";
import { Button } from "../../../../../ui/button";
import type { CommentThread } from "../../../../providers/CommentProvider";
import { isOptimisticId } from "../../../../utils/optimisticId";
import { CommentComposer } from "../../../CommentComposer";
import { CommentList } from "../../../CommentList";

const VISIBLE_WITHOUT_FOLDING = 3;

interface PanelThreadProps {
	thread: CommentThread;
	active: boolean;
	servedVersion: number | null;
	onSelect: () => void;
	onReply: (body: string) => void | Promise<void>;
	onEdit?: (commentId: string, body: string) => void | Promise<void>;
	onToggleResolved?: () => void;
	onDelete?: () => void;
}

export function PanelThread({
	thread,
	active,
	servedVersion,
	onSelect,
	onReply,
	onEdit,
	onToggleResolved,
	onDelete,
}: PanelThreadProps) {
	const ref = useRef<HTMLDivElement>(null);
	const [expanded, setExpanded] = useState(false);

	useEffect(() => {
		if (active) ref.current?.scrollIntoView({ block: "nearest" });
	}, [active]);

	const folded = !expanded && thread.comments.length > VISIBLE_WITHOUT_FOLDING;
	const head = folded ? thread.comments.slice(0, 1) : thread.comments;
	const tail = folded ? thread.comments.slice(-2) : [];
	const hidden = thread.comments.length - head.length - tail.length;
	const listProps = { onEdit, onToggleResolved, onDelete };

	return (
		<div
			ref={ref}
			className={cn(
				"overflow-hidden rounded-lg border bg-popover text-popover-foreground transition-colors",
				active && "border-primary/50",
				thread.resolved && "opacity-60",
			)}
		>
			<CommentList
				thread={{ ...thread, comments: head }}
				anchorText={thread.anchor.text || undefined}
				onAnchorClick={onSelect}
				{...listProps}
			/>

			{folded ? (
				<Button
					variant="ghost"
					className="h-auto w-full justify-start rounded-none px-3.5 py-1 font-normal text-muted-foreground text-sm hover:bg-transparent hover:text-foreground"
					onClick={() => setExpanded(true)}
				>
					<Plural value={hidden} one="Show # reply" other="Show # replies" />
				</Button>
			) : null}

			{tail.length > 0 ? (
				<CommentList thread={{ ...thread, comments: tail }} {...listProps} />
			) : null}

			{servedVersion !== null && thread.version !== servedVersion ? (
				<p className="px-3.5 pb-2 text-[11px] text-muted-foreground">
					v{thread.version}
				</p>
			) : null}

			{isOptimisticId(thread.id) ? null : (
				<CommentComposer
					isReply
					onSubmit={onReply}
					onFocus={onSelect}
					className="border-t"
				/>
			)}
		</div>
	);
}
