"use client";

import { useLingui } from "@lingui/react/macro";
import { getInitials } from "@superset/shared/names";
import {
	FRAME_CHANNEL,
	type FrameMessage,
	HOST_CHANNEL,
	type HostMessageBody,
} from "@superset/shared/page-comments-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useComments } from "../../providers/CommentProvider";
import { CommentBubble, pinClassName } from "./components/CommentBubble";
import { CommentPopover } from "./components/CommentPopover";
import { PageFrame } from "./components/PageFrame";
import { SelectionToolbar } from "./components/SelectionToolbar";
import {
	type PinPoint,
	pinPointOf,
	pinTransform,
	stackPins,
} from "./utils/pinLayout";

interface PageCommentsViewProps {
	/** The page's own origin, which serves it with the comment runtime injected. */
	src: string;
	title: string;
	initialScrollY?: number;
	onScrollYChange?: (y: number) => void;
	/**
	 * A press inside the frame. It never bubbles into the host document, so a
	 * host that focuses on click (a pane) hears about it here instead.
	 */
	onFramePointerDown?: () => void;
}

export function PageCommentsView({
	src,
	title,
	initialScrollY,
	onScrollYChange,
	onFramePointerDown,
}: PageCommentsViewProps) {
	const scrollYRef = useRef(initialScrollY ?? 0);
	const onScrollYChangeRef = useRef(onScrollYChange);
	onScrollYChangeRef.current = onScrollYChange;
	const onFramePointerDownRef = useRef(onFramePointerDown);
	onFramePointerDownRef.current = onFramePointerDown;
	const frameRef = useRef<HTMLIFrameElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [container, setContainer] = useState({ width: 0, height: 0 });
	const [frameEpoch, setFrameEpoch] = useState(0);
	const [readySrc, setReadySrc] = useState<string | null>(null);

	const { i18n } = useLingui();
	const {
		user,
		enabled,
		toggleEnabled,
		submitting,
		threads,
		draft,
		openDraft,
		discardDraft,
		selection,
		openSelection,
		clearSelection,
		activeThreadId,
		setActiveThreadId,
		panelOpen,
		setPanelOpen,
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

	const frameOrigin = useMemo(() => new URL(src).origin, [src]);

	/**
	 * Escape peels one layer at a time: the draft you are composing, then an
	 * open thread, then the panel, then comment mode itself.
	 */
	const dismiss = useCallback(() => {
		if (submitting) return;
		if (draft) {
			discardDraft();
			return;
		}
		if (selection) {
			clearSelection();
			return;
		}
		if (activeThreadId) {
			setActiveThreadId(null);
			return;
		}
		if (panelOpen) {
			setPanelOpen(false);
			return;
		}
		if (enabled) toggleEnabled();
	}, [
		activeThreadId,
		clearSelection,
		discardDraft,
		draft,
		enabled,
		panelOpen,
		selection,
		setActiveThreadId,
		setPanelOpen,
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

	const send = useCallback(
		(message: HostMessageBody) => {
			frameRef.current?.contentWindow?.postMessage(
				{ channel: HOST_CHANNEL, ...message },
				frameOrigin,
			);
		},
		[frameOrigin],
	);

	const popoverThread = panelOpen
		? null
		: threads.find((thread) => thread.id === activeThreadId);
	const popoverOpen = Boolean(draft || popoverThread || selection);
	const locked = popoverOpen;
	useEffect(() => {
		const element = containerRef.current;
		if (!element) return;
		const measure = () => {
			const width = element.clientWidth;
			const height = element.clientHeight;
			setContainer((previous) =>
				previous.width === width && previous.height === height
					? previous
					: { width, height },
			);
		};
		measure();
		if (!popoverOpen) return;
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, [popoverOpen]);

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			if (event.origin !== frameOrigin) return;
			if (event.source !== frameRef.current?.contentWindow) return;
			const data = event.data as FrameMessage | undefined;
			if (!data || data.channel !== FRAME_CHANNEL) return;

			if (data.type === "ready") {
				setReadySrc(src);
				setFrameEpoch((epoch) => epoch + 1);
				if (scrollYRef.current > 0) {
					send({ type: "restore-scroll", y: scrollYRef.current });
				}
			}
			if (data.type === "scroll") {
				scrollYRef.current = data.y;
				onScrollYChangeRef.current?.(data.y);
			}
			if (data.type === "hover") setHoverRect(data.rect);
			if (data.type === "pointer-down") {
				onFramePointerDownRef.current?.();
				notifyFramePointerDown();
				if (!submitting) {
					discardDraft();
					clearSelection();
					setActiveThreadId(null);
				}
			}
			if (data.type === "escape") dismiss();
			if (data.type === "rects") setRects(data.entries);
			if (data.type === "pick" && !popoverOpen) {
				openSelection({ anchor: data.anchor, rect: data.rect });
				setHoverRect(null);
			}
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [
		clearSelection,
		discardDraft,
		dismiss,
		frameOrigin,
		notifyFramePointerDown,
		openSelection,
		popoverOpen,
		send,
		setActiveThreadId,
		setHoverRect,
		setRects,
		src,
		submitting,
	]);

	useEffect(() => {
		send({ type: "ready" });
	}, [send]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: frameEpoch is a resend trigger, not a value read here
	useEffect(() => {
		send({ type: "set-mode", enabled, locked });
	}, [enabled, locked, frameEpoch, send]);

	const unresolvedThreads = useMemo(
		() => threads.filter((thread) => !thread.resolved),
		[threads],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: frameEpoch resends the anchor set to a runtime that just restarted
	useEffect(() => {
		send({
			type: "track",
			anchors: unresolvedThreads.map((thread) => ({
				id: thread.id,
				anchor: thread.anchor,
			})),
		});
	}, [frameEpoch, send, unresolvedThreads]);

	const pins = useMemo(() => {
		const out: { id: string; point: PinPoint }[] = [];
		for (const thread of unresolvedThreads) {
			const rect = rects[thread.id];
			if (rect)
				out.push({ id: thread.id, point: pinPointOf(rect, thread.anchor) });
		}
		return out;
	}, [rects, unresolvedThreads]);

	const pinPoints = useMemo(
		() => new Map(pins.map((pin) => [pin.id, pin.point])),
		[pins],
	);
	const stackIndex = useMemo(() => stackPins(pins), [pins]);

	const activePoint = popoverThread ? pinPoints.get(popoverThread.id) : null;
	const draftPoint = draft ? pinPointOf(draft.rect, draft.anchor) : null;

	return (
		<div ref={containerRef} className="relative h-full w-full">
			<PageFrame
				ref={frameRef}
				src={src}
				title={title}
				ready={readySrc === src}
				onLoad={() => setFrameEpoch((epoch) => epoch + 1)}
			/>

			<div className="pointer-events-none absolute inset-0 overflow-hidden">
				{enabled && !locked && hoverRect ? (
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

				{selection ? (
					<div
						style={{
							transform: `translate(${selection.rect.left}px, ${selection.rect.top}px)`,
							width: selection.rect.width,
							height: selection.rect.height,
						}}
						className="absolute top-0 left-0 rounded-sm bg-blue-500/10 ring-1 ring-blue-500/70"
					/>
				) : null}

				{draftPoint ? (
					<div
						aria-hidden
						style={{ transform: pinTransform(draftPoint) }}
						className={pinClassName({ resolved: false, active: false })}
					>
						{getInitials(user.name) || "?"}
					</div>
				) : null}

				{unresolvedThreads.map((thread) => {
					const point = pinPoints.get(thread.id);
					if (!point) return null;
					const first = thread.comments[0];
					return (
						<CommentBubble
							key={thread.id}
							point={point}
							stackIndex={stackIndex[thread.id] ?? 0}
							initials={getInitials(first?.authorName) || "?"}
							count={thread.comments.length}
							resolved={thread.resolved}
							intent={thread.intent}
							active={thread.id === activeThreadId}
							onClick={() => {
								discardDraft();
								clearSelection();
								setActiveThreadId(
									thread.id === activeThreadId ? null : thread.id,
								);
							}}
						/>
					);
				})}
			</div>

			<div className="pointer-events-none absolute inset-0">
				{selection ? (
					<SelectionToolbar
						rect={selection.rect}
						container={container}
						onComment={() => openDraft(selection)}
						onQuick={(body, intent) => {
							createThread({
								anchor: selection.anchor,
								anchorText: selection.anchor.text,
								body: i18n._(body),
								intent,
							}).catch((error) => {
								console.error("Quick feedback failed to post", error);
							});
						}}
						onDismiss={clearSelection}
					/>
				) : null}

				{draft && draftPoint ? (
					<CommentPopover
						point={draftPoint}
						container={container}
						thread={null}
						initialValue={draft.body}
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

				{popoverThread && activePoint ? (
					<CommentPopover
						key={popoverThread.id}
						point={activePoint}
						container={container}
						thread={popoverThread}
						onDismiss={() => setActiveThreadId(null)}
						onSubmit={(body) => addReply(popoverThread.id, body)}
						onEdit={(commentId, body) =>
							editComment(popoverThread.id, commentId, body)
						}
						onToggleResolved={() =>
							setResolved(popoverThread.id, !popoverThread.resolved)
						}
						onDelete={() => deleteThread(popoverThread.id)}
					/>
				) : null}
			</div>
		</div>
	);
}
