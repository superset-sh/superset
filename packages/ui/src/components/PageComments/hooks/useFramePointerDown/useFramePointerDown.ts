"use client";

import { useEffect, useRef } from "react";
import { useComments } from "../../providers/CommentProvider";

export function useFramePointerDown(onPointerDown: () => void) {
	const { framePointerDownAt } = useComments();
	const seen = useRef(framePointerDownAt);

	useEffect(() => {
		if (framePointerDownAt === seen.current) return;
		seen.current = framePointerDownAt;
		onPointerDown();
	}, [framePointerDownAt, onPointerDown]);
}
