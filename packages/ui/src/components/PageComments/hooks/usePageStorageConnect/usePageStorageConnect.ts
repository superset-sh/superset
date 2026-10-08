"use client";

import {
	type PageStorageFrameMessage,
	STORAGE_FRAME_CHANNEL,
	STORAGE_HOST_CHANNEL,
} from "@superset/shared/page-storage";
import { type RefObject, useEffect, useRef } from "react";

const HELLO_COOLDOWN_MS = 2000;

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
		let dialing = false;
		let connectedAt = 0;

		const onMessage = async (event: MessageEvent) => {
			if (event.origin !== frameOrigin) return;
			if (event.source !== frameRef.current?.contentWindow) return;
			const data = event.data as PageStorageFrameMessage | undefined;
			if (!data || data.channel !== STORAGE_FRAME_CHANNEL) return;
			if (data.type !== "hello") return;
			if (dialing || Date.now() - connectedAt < HELLO_COOLDOWN_MS) return;

			dialing = true;
			const url = await ticketRef.current?.().catch(() => null);
			dialing = false;
			if (stopped || !url) return;
			connectedAt = Date.now();
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
