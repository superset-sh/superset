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
import { CommentBubble, pinClassName } from "./components/CommentBubble";
import { CommentPopover, initialsOf } from "./components/CommentPopover";
import { PageFrame } from "./components/PageFrame";
import {
	PIN_SIZE,
	type PinPoint,
	pinPointOf,
	stackPins,
} from "./utils/pinLayout";

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
		user,
		enabled,
		toggleEnabled,
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

	/**
	 * Escape peels one layer at a time: the draft you are composing, then an
	 * open thread, then comment mode itself.
	 */
	const dismiss = useCallback(() => {
		if (submitting) return;
		if (draft) {
			discardDraft();
			return;
		}
		if (activeThreadId) {
			setActiveThreadId(null);
			return;
		}
		if (enabled) toggleEnabled();
	}, [
		activeThreadId,
		discardDraft,
		draft,
		enabled,
		setActiveThreadId,
		submitting,
		toggleEnabled,
	]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !event.defaultPrevented) dismiss();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [dismiss]);

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
			if (data.type === "escape") dismiss();
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
		dismiss,
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

	const pins = useMemo(() => {
		const out: { id: string; point: PinPoint }[] = [];
		for (const thread of threads) {
			const rect = rects[thread.id];
			if (rect)
				out.push({ id: thread.id, point: pinPointOf(rect, thread.anchor) });
		}
		return out;
	}, [rects, threads]);

	const pinPoints = useMemo(
		() => new Map(pins.map((pin) => [pin.id, pin.point])),
		[pins],
	);
	const stackIndex = useMemo(() => stackPins(pins), [pins]);

	const activeThread = threads.find((thread) => thread.id === activeThreadId);
	const activePoint = activeThread ? pinPoints.get(activeThread.id) : null;
	const draftPoint = draft ? pinPointOf(draft.rect, draft.anchor) : null;

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
						// Same reasoning as the pin: this outline sits on the reader's
						// page, so it cannot borrow the app theme's colours.
						className="absolute top-0 left-0 rounded-sm bg-blue-500/5 ring-1 ring-blue-500/70"
					/>
				) : null}

				{draftPoint ? (
					<div
						aria-hidden
						style={{
							transform: `translate(${draftPoint.x - PIN_SIZE / 2}px, ${draftPoint.y - PIN_SIZE / 2}px)`,
						}}
						className={pinClassName({ resolved: false, active: false })}
					>
						{initialsOf(user.name)}
					</div>
				) : null}

				{threads.map((thread) => {
					const point = pinPoints.get(thread.id);
					if (!point) return null;
					const first = thread.comments[0];
					return (
						<CommentBubble
							key={thread.id}
							point={point}
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
				{draft && draftPoint ? (
					<CommentPopover
						point={draftPoint}
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

				{activeThread && activePoint ? (
					<CommentPopover
						key={activeThread.id}
						point={activePoint}
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
