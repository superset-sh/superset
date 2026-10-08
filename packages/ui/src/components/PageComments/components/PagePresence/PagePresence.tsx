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
	presenceViewersFrom,
} from "@superset/shared/page-presence";
import {
	type PageStorageFrameMessage,
	STORAGE_FRAME_CHANNEL,
} from "@superset/shared/page-storage";
import type { PageViewportZoom } from "@superset/shared/page-zoom";
import { type RefObject, useEffect, useState } from "react";
import { setPageViewers } from "../../stores/pagePresenceStore";
import { PresenceCursor } from "./components/PresenceCursor";

interface PagePresenceProps {
	pageId?: string;
	frameRef: RefObject<HTMLIFrameElement | null>;
	frameOrigin: string;
}

export function PagePresence({
	pageId,
	frameRef,
	frameOrigin,
}: PagePresenceProps) {
	const { t } = useLingui();
	const [view] = useState(() => Symbol("page-presence"));
	const [viewers, setViewers] = useState<PagePresenceViewer[]>([]);
	const [cursors, setCursors] = useState<PageCursorPoint[]>([]);
	const [viewport, setViewport] = useState<PageViewportZoom | null>(null);

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
			if (data.type === "presence") {
				setViewers(presenceViewersFrom(data.viewers));
			}
			if (data.type === "cursors") setCursors(cursorPointsFrom(data.cursors));
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [frameOrigin, frameRef]);

	const guestName = t({ message: "Guest" });

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
						name: viewer.guest || !viewer.name ? guestName : viewer.name,
						image: viewer.image,
						color: presenceColor(viewer.userId),
					},
				];
			}),
		);
	}, [pageId, view, viewers, guestName]);

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
						name={viewer.guest || !viewer.name ? guestName : viewer.name}
						color={presenceColor(viewer.userId)}
					/>
				);
			})}
		</div>
	);
}
