"use client";

import { pageGuestSocketUrl } from "@superset/shared/page-storage-ticket";
import {
	PageFrame,
	PagePresence,
	usePageStorageConnect,
} from "@superset/ui/page-comments";
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
	const ticket = useCallback(
		() =>
			pageGuestSocketUrl({
				pageId,
				realtimeUrl: env.NEXT_PUBLIC_REALTIME_URL,
				guestId: guestId(),
			}),
		[pageId],
	);

	usePageStorageConnect({ frameRef, frameOrigin, ticket });

	return (
		<div className="relative h-full w-full">
			<PageFrame ref={frameRef} src={src} title={title} />
			<PagePresence
				key={src}
				pageId={pageId}
				frameRef={frameRef}
				frameOrigin={frameOrigin}
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
