"use client";

import { useEffect, useRef } from "react";
import {
	joinPagePresence,
	wakePagePresence,
} from "../../stores/pagePresenceStore";

export function useJoinPagePresence({
	pageId,
	url,
}: {
	pageId: string | undefined;
	url: (() => Promise<string | null>) | undefined;
}): void {
	const urlRef = useRef(url);
	urlRef.current = url;
	const enabled = Boolean(pageId && url);

	useEffect(() => {
		if (!pageId || !enabled) return;
		const leave = joinPagePresence(
			pageId,
			async () => (await urlRef.current?.()) ?? null,
		);
		const wake = () => {
			if (document.visibilityState === "visible") wakePagePresence();
		};
		window.addEventListener("online", wake);
		document.addEventListener("visibilitychange", wake);
		return () => {
			window.removeEventListener("online", wake);
			document.removeEventListener("visibilitychange", wake);
			leave();
		};
	}, [pageId, enabled]);
}
