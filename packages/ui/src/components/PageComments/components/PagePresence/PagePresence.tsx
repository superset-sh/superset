"use client";

import {
	FRAME_CHANNEL,
	type FrameMessage,
	HOST_CHANNEL,
	type HostMessageBody,
} from "@superset/shared/page-comments-runtime";
import {
	cursorPointsFrom,
	type PageCursorPoint,
	parsePageCursor,
	presenceColor,
} from "@superset/shared/page-presence";
import type { PageViewportZoom } from "@superset/shared/page-zoom";
import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { usePresenceName } from "../../hooks/usePresenceName";
import {
	joinPagePresence,
	setPagePointer,
	usePagePresence,
	wakePagePresence,
} from "../../stores/pagePresenceStore";
import { PresenceCursor } from "./components/PresenceCursor";

interface PagePresenceProps {
	pageId: string;
	frameRef: RefObject<HTMLIFrameElement | null>;
	frameOrigin: string;
	url: () => Promise<string | null>;
}

export function PagePresence({
	pageId,
	frameRef,
	frameOrigin,
	url,
}: PagePresenceProps) {
	const nameOf = usePresenceName();
	const { viewers, cursors } = usePagePresence(pageId);
	const [points, setPoints] = useState<PageCursorPoint[]>([]);
	const [viewport, setViewport] = useState<PageViewportZoom | null>(null);
	const urlRef = useRef(url);
	urlRef.current = url;

	const send = useCallback(
		(message: HostMessageBody) => {
			frameRef.current?.contentWindow?.postMessage(
				{ channel: HOST_CHANNEL, ...message },
				frameOrigin,
			);
		},
		[frameOrigin, frameRef],
	);

	useEffect(() => {
		const leave = joinPagePresence(pageId, () => urlRef.current());
		const wake = () => {
			if (document.visibilityState === "visible") wakePagePresence();
		};
		window.addEventListener("online", wake);
		document.addEventListener("visibilitychange", wake);
		return () => {
			window.removeEventListener("online", wake);
			document.removeEventListener("visibilitychange", wake);
			setPagePointer(pageId, null);
			leave();
		};
	}, [pageId]);

	const trackCursors = useCallback(() => {
		const present = new Set(viewers.map((viewer) => viewer.id));
		send({
			type: "track-cursors",
			cursors: [...cursors]
				.filter(([id]) => present.has(id))
				.map(([id, cursor]) => ({ id, ...cursor })),
		});
	}, [cursors, send, viewers]);

	const trackCursorsRef = useRef(trackCursors);
	trackCursorsRef.current = trackCursors;

	useEffect(() => {
		trackCursors();
	}, [trackCursors]);

	useEffect(() => {
		send({ type: "set-pointer-reporting", enabled: true });
		return () => {
			send({ type: "set-pointer-reporting", enabled: false });
			send({ type: "track-cursors", cursors: [] });
		};
	}, [send]);

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			if (event.origin !== frameOrigin) return;
			if (event.source !== frameRef.current?.contentWindow) return;
			const data = event.data as FrameMessage | undefined;
			if (data?.channel !== FRAME_CHANNEL) return;
			if (data.type === "ready") {
				send({ type: "set-pointer-reporting", enabled: true });
				trackCursorsRef.current();
			}
			if (data.type === "viewport-zoom") setViewport(data.viewport);
			if (data.type === "pointer") {
				setPagePointer(pageId, parsePageCursor(data.cursor) ?? null);
			}
			if (data.type === "cursor-points") {
				setPoints(cursorPointsFrom(data.points));
			}
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [frameOrigin, frameRef, pageId, send]);

	const byId = new Map(viewers.map((viewer) => [viewer.id, viewer]));

	return (
		<div className="pointer-events-none absolute inset-0 overflow-hidden">
			{points.map((point) => {
				const viewer = byId.get(point.id);
				if (!viewer) return null;
				return (
					<PresenceCursor
						key={point.id}
						x={viewport ? point.x * viewport.scale - viewport.x : point.x}
						y={viewport ? point.y * viewport.scale - viewport.y : point.y}
						name={nameOf(viewer)}
						color={presenceColor(viewer.userId)}
					/>
				);
			})}
		</div>
	);
}
