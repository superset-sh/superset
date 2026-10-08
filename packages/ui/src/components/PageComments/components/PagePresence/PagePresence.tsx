"use client";

import { useLingui } from "@lingui/react/macro";
import {
	FRAME_CHANNEL,
	type FrameMessage,
} from "@superset/shared/page-comments-runtime";
import {
	cursorPointsFrom,
	type PageCursorPoint,
	type PagePresenceViewer,
	presenceColor,
} from "@superset/shared/page-presence";
import { openPresenceWatch } from "@superset/shared/page-presence-watch";
import {
	type PageStorageFrameMessage,
	STORAGE_FRAME_CHANNEL,
} from "@superset/shared/page-storage";
import type { PageViewportZoom } from "@superset/shared/page-zoom";
import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { setPageViewers } from "../../stores/pagePresenceStore";
import { PresenceCursor } from "./components/PresenceCursor";

interface PagePresenceProps {
	pageId?: string;
	frameRef: RefObject<HTMLIFrameElement | null>;
	frameOrigin: string;
	watchTicket?: () => Promise<string | null>;
}

export function PagePresence({
	pageId,
	frameRef,
	frameOrigin,
	watchTicket,
}: PagePresenceProps) {
	const { t } = useLingui();
	const [view] = useState(() => Symbol("page-presence"));
	const [viewers, setViewers] = useState<PagePresenceViewer[]>([]);
	const [cursors, setCursors] = useState<PageCursorPoint[]>([]);
	const [viewport, setViewport] = useState<PageViewportZoom | null>(null);
	const watchTicketRef = useRef(watchTicket);
	watchTicketRef.current = watchTicket;
	const watching = Boolean(watchTicket);

	useEffect(() => {
		if (!watching) return;
		const watch = openPresenceWatch({
			url: async () => (await watchTicketRef.current?.()) ?? null,
			onViewers: setViewers,
		});
		const wake = () => {
			if (document.visibilityState === "visible") watch.wake();
		};
		window.addEventListener("online", wake);
		document.addEventListener("visibilitychange", wake);
		return () => {
			window.removeEventListener("online", wake);
			document.removeEventListener("visibilitychange", wake);
			watch.stop();
			setViewers([]);
		};
	}, [watching]);

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			if (event.origin !== frameOrigin) return;
			if (event.source !== frameRef.current?.contentWindow) return;
			const data = event.data as
				| PageStorageFrameMessage
				| FrameMessage
				| undefined;
			if (data?.channel === FRAME_CHANNEL && data.type === "viewport-zoom") {
				setViewport(data.viewport);
				return;
			}
			if (data?.channel !== STORAGE_FRAME_CHANNEL) return;
			if (data.type === "cursors") setCursors(cursorPointsFrom(data.cursors));
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [frameOrigin, frameRef]);

	const nameOf = useCallback(
		(viewer: PagePresenceViewer) => {
			const number = viewer.guestNumber;
			if (!viewer.guest && viewer.name) return viewer.name;
			return number
				? t({ message: `Guest ${number}` })
				: t({ message: "Guest" });
		},
		[t],
	);

	useEffect(() => {
		if (!pageId) return;
		const seen = new Set<string>();
		setPageViewers(
			pageId,
			view,
			viewers.flatMap((viewer) => {
				if (seen.has(viewer.userId)) return [];
				seen.add(viewer.userId);
				return [
					{
						id: viewer.userId,
						name: nameOf(viewer),
						image: viewer.image,
						color: presenceColor(viewer.userId),
					},
				];
			}),
		);
	}, [pageId, view, viewers, nameOf]);

	useEffect(() => {
		if (!pageId) return;
		return () => setPageViewers(pageId, view, []);
	}, [pageId, view]);

	const byId = new Map(viewers.map((viewer) => [viewer.id, viewer]));

	return (
		<div className="pointer-events-none absolute inset-0 overflow-hidden">
			{cursors.map((cursor) => {
				const viewer = byId.get(cursor.id);
				if (!viewer) return null;
				return (
					<PresenceCursor
						key={cursor.id}
						x={viewport ? cursor.x * viewport.scale - viewport.x : cursor.x}
						y={viewport ? cursor.y * viewport.scale - viewport.y : cursor.y}
						name={nameOf(viewer)}
						color={presenceColor(viewer.userId)}
					/>
				);
			})}
		</div>
	);
}
