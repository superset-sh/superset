"use client";

import { MessageSquare } from "lucide-react";
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
	const {
		threads,
		isLoading,
		rects,
		rectsReady,
		activeThreadId,
		setActiveThreadId,
	} = useComments();
	const { setResolved } = useComments();
	const [showResolved, setShowResolved] = useState(false);

	const { anchored, unanchored, openCount } = useMemo(
		() => groupThreads({ threads, rects, rectsReady, showResolved }),
		[threads, rects, rectsReady, showResolved],
	);

	const sort = (list: typeof anchored) =>
		[...list].sort((a, b) => newestActivity(b) - newestActivity(a));

	const resolvedCount = threads.length - openCount;
	const empty = anchored.length === 0 && unanchored.length === 0;

	return (
		<aside
			className={cn(
				"flex h-full w-[300px] shrink-0 flex-col border-l bg-background",
				className,
			)}
		>
			{header ? <div className="border-b p-3">{header}</div> : null}

			<div className="flex items-center gap-2 border-b px-3 py-2">
				<MessageSquare className="size-3.5 text-muted-foreground" />
				<span className="text-xs font-medium">
					{openCount} open {openCount === 1 ? "comment" : "comments"}
				</span>
				{resolvedCount > 0 ? (
					<Button
						size="sm"
						variant="ghost"
						className="ml-auto h-6 px-1.5 text-[11px]"
						onClick={() => setShowResolved((value) => !value)}
					>
						{showResolved ? "Hide" : "Show"} resolved ({resolvedCount})
					</Button>
				) : null}
			</div>

			<div className="flex-1 overflow-y-auto p-2">
				{isLoading ? (
					<p className="p-2 text-xs text-muted-foreground">Loading comments…</p>
				) : empty ? (
					<p className="p-2 text-xs text-muted-foreground">
						No comments yet. Turn on comment mode and click anything on the page
						to start one.
					</p>
				) : (
					<div className="flex flex-col gap-1">
						{sort(anchored).map((thread) => (
							<SidebarThread
								key={thread.id}
								thread={thread}
								active={activeThreadId === thread.id}
								servedVersion={servedVersion}
								onSelect={() =>
									setActiveThreadId(
										activeThreadId === thread.id ? null : thread.id,
									)
								}
								onToggleResolved={() =>
									void setResolved(thread.id, !thread.resolved)
								}
							/>
						))}

						{unanchored.length > 0 ? (
							<>
								<div className="px-2.5 pt-3 pb-1">
									<span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
										Not on this version
									</span>
									<p className="pt-0.5 text-[10px] text-muted-foreground">
										What these were written against is no longer on the page, so
										they have no pin.
									</p>
								</div>
								{sort(unanchored).map((thread) => (
									<SidebarThread
										key={thread.id}
										thread={thread}
										active={activeThreadId === thread.id}
										servedVersion={servedVersion}
										onSelect={() =>
											setActiveThreadId(
												activeThreadId === thread.id ? null : thread.id,
											)
										}
										onToggleResolved={() =>
											void setResolved(thread.id, !thread.resolved)
										}
									/>
								))}
							</>
						) : null}
					</div>
				)}
			</div>
		</aside>
	);
}
