"use client";

import { pagePresenceUrl } from "@superset/shared/page-presence";
import { PageFrame, PagePresence } from "@superset/ui/page-comments";
import { useCallback, useMemo, useRef } from "react";
import { env } from "@/env";

const GUEST_ID_KEY = "superset.page-guest-id";

interface PublicPageFrameProps {
	pageId: string;
	src: string;
	title: string;
}

export function PublicPageFrame({ pageId, src, title }: PublicPageFrameProps) {
	const frameRef = useRef<HTMLIFrameElement>(null);
	const frameOrigin = useMemo(() => new URL(src).origin, [src]);
	const presenceUrl = useCallback(
		async () =>
			pagePresenceUrl({
				realtimeUrl: env.NEXT_PUBLIC_REALTIME_URL,
				pageId,
				guestId: guestId(),
			}),
		[pageId],
	);

	return (
		<div className="relative h-full w-full">
			<PageFrame ref={frameRef} src={src} title={title} />
			<PagePresence
				key={src}
				pageId={pageId}
				frameRef={frameRef}
				frameOrigin={frameOrigin}
				url={presenceUrl}
			/>
		</div>
	);
}

function guestId(): string {
	try {
		const stored = localStorage.getItem(GUEST_ID_KEY);
		if (stored && /^[0-9a-f-]{36}$/.test(stored)) return stored;
		const id = crypto.randomUUID();
		localStorage.setItem(GUEST_ID_KEY, id);
		return id;
	} catch {
		return crypto.randomUUID();
	}
}
