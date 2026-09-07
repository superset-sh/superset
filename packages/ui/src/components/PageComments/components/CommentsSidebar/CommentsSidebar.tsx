"use client";

import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { MessageSquare, X } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { cn } from "../../../../lib/utils";
import { Button } from "../../../ui/button";
import { useComments } from "../../providers/CommentProvider";
import { SidebarThread } from "./components/SidebarThread";
import { groupThreads, newestActivity } from "./utils/groupThreads";

interface CommentsSidebarProps {
	servedVersion?: number | null;
	header?: ReactNode;
	className?: string;
}

export function CommentsSidebar({
	servedVersion = null,
	header,
	className,
}: CommentsSidebarProps) {
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

	const { anchored, unanchored, openCount } = useMemo(
		() => groupThreads({ threads, rects, rectsReady, showResolved }),
		[threads, rects, rectsReady, showResolved],
	);

	const sort = (list: typeof anchored) =>
		[...list].sort((a, b) => newestActivity(b) - newestActivity(a));

	const resolvedCount = threads.length - openCount;
	const empty = anchored.length === 0 && unanchored.length === 0;

	const threadProps = (thread: (typeof anchored)[number]) => ({
		thread,
		active: activeThreadId === thread.id,
		servedVersion,
		onSelect: () =>
			setActiveThreadId(activeThreadId === thread.id ? null : thread.id),
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
				// Mobile is a full-screen sheet over the page, opened from the
				// header. The rail only exists once there is width to spare: at
				// 300px fixed it left a phone about 90px of page.
				"fixed inset-0 z-50 flex-col bg-background",
				panelOpen ? "flex" : "hidden",
				"md:static md:z-auto md:flex md:w-[300px] md:shrink-0 md:border-l",
				className,
			)}
		>
			{header ? <div className="border-b p-3">{header}</div> : null}

			<div className="flex items-center gap-2 border-b px-3 py-2 md:py-2">
				<MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="text-xs font-medium">
					<Plural
						value={openCount}
						one="# open comment"
						other="# open comments"
					/>
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
					size="icon"
					variant="ghost"
					aria-label={t({ message: "Close comments" })}
					className={cn("size-7 md:hidden", resolvedCount > 0 ? "" : "ml-auto")}
					onClick={() => setPanelOpen(false)}
				>
					<X className="size-4" />
				</Button>
			</div>

			<div className="flex-1 overflow-y-auto p-2">
				{isLoading ? (
					<p className="p-2 text-xs text-muted-foreground">
						<Trans>Loading comments…</Trans>
					</p>
				) : empty ? (
					<p className="p-2 text-xs text-muted-foreground">
						<Trans>
							No comments yet. Turn on comment mode and click anything on the
							page to start one.
						</Trans>
					</p>
				) : (
					<div className="flex flex-col gap-1">
						{sort(anchored).map((thread) => (
							<SidebarThread key={thread.id} {...threadProps(thread)} />
						))}

						{unanchored.length > 0 ? (
							<>
								<div className="px-2.5 pt-3 pb-1">
									<span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
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
									<SidebarThread key={thread.id} {...threadProps(thread)} />
								))}
							</>
						) : null}
					</div>
				)}
			</div>
		</aside>
	);
}
