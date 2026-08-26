"use client";

import { useEffect, useRef } from "react";
import { FRAME_CHANNEL, type FrameMessage } from "../../utils/commentRuntime";

export function useFramePointerDown(onPointerDown: () => void) {
	const handler = useRef(onPointerDown);
	handler.current = onPointerDown;

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			const data = event.data as FrameMessage | undefined;
			if (!data || data.channel !== FRAME_CHANNEL) return;
			if (data.type !== "pointer-down") return;
			handler.current();
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, []);
}
