"use client";

import { pagePresenceUrl } from "@superset/shared/page-presence";
import { pageStorageSocketUrl } from "@superset/shared/page-storage-ticket";
import { PageCommentsView } from "@superset/ui/page-comments";
import { useCallback } from "react";
import { env } from "@/env";
import { getAuthToken } from "../../../../../trpc/auth-token";

export function PageCommentsFrame({
	pageId,
	src,
	title,
	previewing = false,
}: {
	pageId: string;
	src: string;
	title: string;
	previewing?: boolean;
}) {
	const storageTicket = useCallback(
		() =>
			pageStorageSocketUrl({
				pageId,
				realtimeUrl: env.NEXT_PUBLIC_REALTIME_URL,
				token: () => getAuthToken().catch(() => null),
			}),
		[pageId],
	);

	const presenceUrl = useCallback(async () => {
		const token = await getAuthToken().catch(() => null);
		return token
			? pagePresenceUrl({
					realtimeUrl: env.NEXT_PUBLIC_REALTIME_URL,
					pageId,
					token,
				})
			: null;
	}, [pageId]);

	return (
		<PageCommentsView
			pageId={pageId}
			src={src}
			title={title}
			{...(previewing ? {} : { storageTicket, presenceUrl })}
		/>
	);
}
