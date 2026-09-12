"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { differenceInCalendarDays } from "date-fns";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../../../lib/utils";
import { Button } from "../../../ui/button";
import { useComments } from "../../providers/CommentProvider";
import { PanelThread } from "./components/PanelThread";
import { groupByDay, groupThreads, newestActivity } from "./utils/groupThreads";

interface CommentsPanelProps {
	servedVersion?: number | null;
	header?: ReactNode;
	className?: string;
}

export function CommentsPanel({
	servedVersion = null,
	header,
	className,
}: CommentsPanelProps) {
	const { formatDate } = useFormat();

	const { t } = useLingui();
	const {
		threads,
		isLoading,
		rects,
		rectsReady,
		activeThreadId,
		setActiveThreadId,
		setResolved,
		addReply,
		editComment,
		deleteThread,
		panelOpen,
		setPanelOpen,
	} = useComments();
	const [showResolved, setShowResolved] = useState(false);
	const closeRef = useRef<HTMLButtonElement>(null);

	const { anchored, unanchored, openCount } = useMemo(
		() => groupThreads({ threads, rects, rectsReady, showResolved }),
		[threads, rects, rectsReady, showResolved],
	);

	useEffect(() => {
		if (panelOpen) closeRef.current?.focus();
	}, [panelOpen]);

	if (!panelOpen) return null;

	const sort = (list: typeof anchored) =>
		[...list].sort((a, b) => newestActivity(b) - newestActivity(a));

	const dayLabel = (day: number) => {
		const age = differenceInCalendarDays(Date.now(), day);
		if (age <= 0) return t({ message: "Today" });
		if (age === 1) return t({ message: "Yesterday" });
		if (age < 7) return formatDate(day, { weekday: "long" });
		return formatDate(day);
	};

	const resolvedCount = threads.length - openCount;
	const empty = anchored.length === 0 && unanchored.length === 0;

	const threadProps = (thread: (typeof anchored)[number]) => ({
		thread,
		active: activeThreadId === thread.id,
		servedVersion,
		onSelect: () => setActiveThreadId(thread.id),
		onReply: (body: string) => addReply(thread.id, body),
		onEdit: (commentId: string, body: string) =>
			editComment(thread.id, commentId, body),
		onToggleResolved: () => void setResolved(thread.id, !thread.resolved),
		onDelete: () => void deleteThread(thread.id),
	});

	return (
		<aside
			data-comment-ui=""
			className={cn(
				"absolute inset-0 z-50 flex flex-col bg-background",
				"md:inset-auto md:top-3 md:right-3 md:bottom-3 md:z-40",
				"md:h-fit md:max-h-[calc(100%-1.5rem)] md:w-[340px]",
				"md:rounded-xl md:border md:shadow-lg",
				className,
			)}
		>
			{header ? <div className="border-b p-3">{header}</div> : null}

			<div className="flex items-center gap-2 px-3 py-2">
				<span className="font-medium text-sm">
					<Trans>All comments</Trans>
				</span>
				{resolvedCount > 0 ? (
					<Button
						size="sm"
						variant="ghost"
						className="ml-auto h-6 px-1.5 text-[11px]"
						onClick={() => setShowResolved((value) => !value)}
					>
						{showResolved ? (
							<Trans>Hide resolved ({resolvedCount})</Trans>
						) : (
							<Trans>Show resolved ({resolvedCount})</Trans>
						)}
					</Button>
				) : null}
				<Button
					ref={closeRef}
					size="icon"
					variant="ghost"
					aria-label={t({ message: "Close comments" })}
					className={cn("size-7", resolvedCount > 0 ? "" : "ml-auto")}
					onClick={() => setPanelOpen(false)}
				>
					<X className="size-4" />
				</Button>
			</div>

			<div className="flex-1 overflow-y-auto px-2 pb-2">
				{isLoading ? (
					<p className="p-2 text-muted-foreground text-xs">
						<Trans>Loading comments…</Trans>
					</p>
				) : empty ? (
					<p className="p-2 text-muted-foreground text-xs">
						<Trans>
							No comments yet. Turn on comment mode and click anything on the
							page to start one.
						</Trans>
					</p>
				) : (
					<div className="flex flex-col gap-2">
						{groupByDay(anchored).map((group) => (
							<div key={group.day} className="flex flex-col gap-1.5">
								<span className="px-1.5 text-muted-foreground text-xs">
									{dayLabel(group.day)}
								</span>
								{group.threads.map((thread) => (
									<PanelThread key={thread.id} {...threadProps(thread)} />
								))}
							</div>
						))}

						{unanchored.length > 0 ? (
							<div className="flex flex-col gap-1.5">
								<div className="px-1.5">
									<span className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
										<Trans>Not on this version</Trans>
									</span>
									<p className="pt-0.5 text-[10px] text-muted-foreground">
										<Trans>
											What these were written against is no longer on the page,
											so they have no pin.
										</Trans>
									</p>
								</div>
								{sort(unanchored).map((thread) => (
									<PanelThread key={thread.id} {...threadProps(thread)} />
								))}
							</div>
						) : null}
					</div>
				)}
			</div>
		</aside>
	);
}
