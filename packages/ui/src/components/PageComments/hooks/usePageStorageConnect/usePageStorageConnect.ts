"use client";

import {
	type PageStorageFrameMessage,
	STORAGE_FRAME_CHANNEL,
	STORAGE_HOST_CHANNEL,
} from "@superset/shared/page-storage";
import { type RefObject, useEffect, useRef } from "react";

export function usePageStorageConnect({
	frameRef,
	frameOrigin,
	ticket,
}: {
	frameRef: RefObject<HTMLIFrameElement | null>;
	frameOrigin: string;
	ticket?: () => Promise<string | null>;
}): void {
	const ticketRef = useRef(ticket);
	ticketRef.current = ticket;

	useEffect(() => {
		if (!ticket) return;
		let stopped = false;

		const onMessage = async (event: MessageEvent) => {
			if (event.origin !== frameOrigin) return;
			if (event.source !== frameRef.current?.contentWindow) return;
			const data = event.data as PageStorageFrameMessage | undefined;
			if (!data || data.channel !== STORAGE_FRAME_CHANNEL) return;
			if (data.type !== "hello") return;

			const url = await ticketRef.current?.().catch(() => null);
			if (stopped || !url) return;
			frameRef.current?.contentWindow?.postMessage(
				{ channel: STORAGE_HOST_CHANNEL, type: "connect", url },
				frameOrigin,
			);
		};

		window.addEventListener("message", onMessage);
		return () => {
			stopped = true;
			window.removeEventListener("message", onMessage);
		};
	}, [frameOrigin, frameRef, ticket]);
}
