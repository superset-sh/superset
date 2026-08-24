"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useComments } from "../../providers/CommentProvider";
import {
	FRAME_CHANNEL,
	type FrameMessage,
	HOST_CHANNEL,
	type HostMessageBody,
	injectCommentRuntime,
} from "../../utils/commentRuntime";
import { CommentBubble } from "./components/CommentBubble";
import { CommentPopover, initialsOf } from "./components/CommentPopover";
import { PageFrame } from "./components/PageFrame";

interface PageCommentsViewProps {
	html: string;
	title: string;
	serveHtml?: (injectedHtml: string) => Promise<string>;
}

export function PageCommentsView({
	html,
	title,
	serveHtml,
}: PageCommentsViewProps) {
	const frameRef = useRef<HTMLIFrameElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [container, setContainer] = useState({ width: 0, height: 0 });
	const [frameEpoch, setFrameEpoch] = useState(0);

	const {
		enabled,
		submitting,
		threads,
		draft,
		openDraft,
		discardDraft,
		activeThreadId,
		setActiveThreadId,
		hoverRect,
		setHoverRect,
		rects,
		setRects,
		createThread,
		addReply,
		notifyFramePointerDown,
		editComment,
		setResolved,
		deleteThread,
	} = useComments();

	const injected = useMemo(() => injectCommentRuntime(html), [html]);

	const [servedSrc, setServedSrc] = useState<string | null>(null);
	useEffect(() => {
		if (!serveHtml) return;
		let active = true;
		setServedSrc(null);
		serveHtml(injected).then(
			(url) => {
				if (active) setServedSrc(url);
			},
			() => {
				if (active) setServedSrc(null);
			},
		);
		return () => {
			active = false;
		};
	}, [injected, serveHtml]);

	const send = useCallback((message: HostMessageBody) => {
		frameRef.current?.contentWindow?.postMessage(
			{ channel: HOST_CHANNEL, ...message },
			"*",
		);
	}, []);

	useEffect(() => {
		const element = containerRef.current;
		if (!element) return;
		const observer = new ResizeObserver(() => {
			setContainer({
				width: element.clientWidth,
				height: element.clientHeight,
			});
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			if (event.source !== frameRef.current?.contentWindow) return;
			const data = event.data as FrameMessage | undefined;
			if (!data || data.channel !== FRAME_CHANNEL) return;

			if (data.type === "ready") setFrameEpoch((epoch) => epoch + 1);
			if (data.type === "hover") setHoverRect(data.rect);
			if (data.type === "pointer-down") {
				notifyFramePointerDown();
				if (!submitting) {
					discardDraft();
					setActiveThreadId(null);
				}
			}
			if (data.type === "rects") setRects(data.entries);
			if (data.type === "pick") {
				openDraft({ anchor: data.anchor, rect: data.rect });
				setHoverRect(null);
			}
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [
		discardDraft,
		notifyFramePointerDown,
		openDraft,
		setActiveThreadId,
		setHoverRect,
		setRects,
		submitting,
	]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: frameEpoch is a resend trigger, not a value read here
	useEffect(() => {
		send({ type: "set-mode", enabled });
	}, [enabled, frameEpoch, send]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: frameEpoch resends the anchor set to a runtime that just restarted
	useEffect(() => {
		send({
			type: "track",
			anchors: threads.map((thread) => ({
				id: thread.id,
				anchor: thread.anchor,
			})),
		});
	}, [frameEpoch, send, threads]);

	const stackIndex = useMemo(() => {
		const seen = new Map<string, number>();
		const out: Record<string, number> = {};
		for (const thread of threads) {
			const taken = seen.get(thread.anchor.path) ?? 0;
			out[thread.id] = taken;
			seen.set(thread.anchor.path, taken + 1);
		}
		return out;
	}, [threads]);

	const activeThread = threads.find((thread) => thread.id === activeThreadId);
	const activeRect = activeThread ? rects[activeThread.id] : null;

	return (
		<div ref={containerRef} className="relative h-full w-full">
			{servedSrc || !serveHtml ? (
				<PageFrame
					ref={frameRef}
					{...(serveHtml ? { src: servedSrc as string } : { html: injected })}
					title={title}
					onLoad={() => setFrameEpoch((epoch) => epoch + 1)}
				/>
			) : null}

			<div className="pointer-events-none absolute inset-0 overflow-hidden">
				{enabled && hoverRect ? (
					<div
						style={{
							transform: `translate(${hoverRect.left}px, ${hoverRect.top}px)`,
							width: hoverRect.width,
							height: hoverRect.height,
						}}
						className="absolute top-0 left-0 rounded-sm bg-primary/5 ring-2 ring-primary"
					/>
				) : null}

				{threads.map((thread) => {
					const rect = rects[thread.id];
					if (!rect) return null;
					const first = thread.comments[0];
					return (
						<CommentBubble
							key={thread.id}
							rect={rect}
							stackIndex={stackIndex[thread.id] ?? 0}
							initials={initialsOf(first?.authorName ?? "?")}
							count={thread.comments.length}
							resolved={thread.resolved}
							active={thread.id === activeThreadId}
							onClick={() => {
								discardDraft();
								setActiveThreadId(
									thread.id === activeThreadId ? null : thread.id,
								);
							}}
						/>
					);
				})}
			</div>

			<div className="pointer-events-none absolute inset-0">
				{draft ? (
					<CommentPopover
						rect={draft.rect}
						container={container}
						thread={null}
						onDismiss={discardDraft}
						onSubmit={(body) =>
							createThread({
								anchor: draft.anchor,
								anchorText: draft.anchor.text,
								body,
							})
						}
					/>
				) : null}

				{activeThread && activeRect ? (
					<CommentPopover
						key={activeThread.id}
						rect={activeRect}
						container={container}
						thread={activeThread}
						onDismiss={() => setActiveThreadId(null)}
						onSubmit={(body) => addReply(activeThread.id, body)}
						onEdit={(commentId, body) =>
							editComment(activeThread.id, commentId, body)
						}
						onToggleResolved={() =>
							setResolved(activeThread.id, !activeThread.resolved)
						}
						onDelete={() => deleteThread(activeThread.id)}
					/>
				) : null}
			</div>
		</div>
	);
}
