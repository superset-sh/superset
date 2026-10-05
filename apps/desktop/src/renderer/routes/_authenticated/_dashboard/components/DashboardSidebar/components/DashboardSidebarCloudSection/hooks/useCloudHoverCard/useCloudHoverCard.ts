import { useCallback, useEffect, useRef, useState } from "react";

const OPEN_DELAY_MS = 400;
const CLOSE_DELAY_MS = 150;

interface HoveredRow {
	workspaceId: string;
	anchor: HTMLElement;
}

export function useCloudHoverCard() {
	const [hovered, setHovered] = useState<HoveredRow | null>(null);
	const hoveredRef = useRef<HoveredRow | null>(null);
	const suppressedRef = useRef(false);
	const openTimer = useRef<number | null>(null);
	const closeTimer = useRef<number | null>(null);

	const show = useCallback((row: HoveredRow | null) => {
		hoveredRef.current = row;
		setHovered(row);
	}, []);
	const clearTimer = useCallback((timer: { current: number | null }) => {
		if (timer.current !== null) window.clearTimeout(timer.current);
		timer.current = null;
	}, []);
	const close = useCallback(() => {
		clearTimer(openTimer);
		clearTimer(closeTimer);
		show(null);
	}, [clearTimer, show]);
	const scheduleClose = useCallback(() => {
		clearTimer(closeTimer);
		closeTimer.current = window.setTimeout(() => show(null), CLOSE_DELAY_MS);
	}, [clearTimer, show]);

	const rowEnter = useCallback(
		(workspaceId: string, anchor: HTMLElement) => {
			if (suppressedRef.current) return;
			clearTimer(closeTimer);
			clearTimer(openTimer);
			// Once a card is showing it moves to the next row at once; the delay
			// only guards the first open.
			if (hoveredRef.current) {
				show({ workspaceId, anchor });
				return;
			}
			openTimer.current = window.setTimeout(
				() => show({ workspaceId, anchor }),
				OPEN_DELAY_MS,
			);
		},
		[clearTimer, show],
	);
	const rowLeave = useCallback(() => {
		clearTimer(openTimer);
		scheduleClose();
	}, [clearTimer, scheduleClose]);
	const cardEnter = useCallback(() => clearTimer(closeTimer), [clearTimer]);
	const setSuppressed = useCallback(
		(suppressed: boolean) => {
			suppressedRef.current = suppressed;
			if (suppressed) close();
		},
		[close],
	);

	useEffect(
		() => () => {
			clearTimer(openTimer);
			clearTimer(closeTimer);
		},
		[clearTimer],
	);

	return {
		hoveredWorkspaceId: hovered?.workspaceId ?? null,
		anchor: hovered?.anchor ?? null,
		rowEnter,
		rowLeave,
		cardEnter,
		cardLeave: scheduleClose,
		close,
		setSuppressed,
	};
}
