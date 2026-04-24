/**
 * Auto-scroll hook — keeps the timeline pinned to the bottom while the
 * session is working, pauses when the user scrolls up, and resumes when
 * they scroll back to (or click a jump button to return to) the bottom.
 *
 * Port of OpenCode's create-auto-scroll.tsx, adapted for React.
 * Handler conventions:
 *   - Pass `scrollRef`, `contentRef` callbacks to the element refs.
 *   - Bind `handleScroll` on the scroll container.
 *   - `working` drives the "actively streaming" mode: while true, any
 *     new content resizes back to bottom (unless userScrolled).
 *
 * Plan reference: 20260421-v2-chat-refactor-phased-plan.md §2.5.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
	canScroll,
	distanceFromBottom,
	isInsideNestedScrollable,
} from "./useAutoScroll.logic";

export interface UseAutoScrollOptions {
	working: boolean;
	bottomThreshold?: number;
	onUserInteracted?: () => void;
	/**
	 * Optional "content signal" that changes every time the timeline
	 * gains new content (e.g. total character count of the active
	 * assistant message). When this changes AND the user hasn't
	 * scrolled away, we pin to the bottom. More reliable than a
	 * ResizeObserver, which fires asynchronously and sometimes misses
	 * streaming delta frames.
	 */
	contentSignal?: number | string;
}

export interface UseAutoScrollReturn {
	scrollRef: (el: HTMLElement | null) => void;
	contentRef: (el: HTMLElement | null) => void;
	handleScroll: () => void;
	handleInteraction: () => void;
	pause: () => void;
	resume: () => void;
	scrollToBottom: () => void;
	forceScrollToBottom: () => void;
	userScrolled: boolean;
}

export function useAutoScroll(
	options: UseAutoScrollOptions,
): UseAutoScrollReturn {
	const {
		working,
		bottomThreshold = 10,
		onUserInteracted,
		contentSignal,
	} = options;
	const [userScrolled, setUserScrolled] = useState(false);
	const scrollElRef = useRef<HTMLElement | null>(null);
	const contentElRef = useRef<HTMLElement | null>(null);
	const autoRef = useRef<{ top: number; time: number } | null>(null);
	const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const settlingRef = useRef(false);
	const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const userScrolledRef = useRef(userScrolled);
	userScrolledRef.current = userScrolled;

	const isActive = () => working || settlingRef.current;

	const markAuto = useCallback((el: HTMLElement) => {
		autoRef.current = {
			top: Math.max(0, el.scrollHeight - el.clientHeight),
			time: Date.now(),
		};
		if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
		autoTimerRef.current = setTimeout(() => {
			autoRef.current = null;
			autoTimerRef.current = null;
		}, 1500);
	}, []);

	const isAutoEvent = useCallback((el: HTMLElement): boolean => {
		const a = autoRef.current;
		if (!a) return false;
		if (Date.now() - a.time > 1500) {
			autoRef.current = null;
			return false;
		}
		return Math.abs(el.scrollTop - a.top) < 2;
	}, []);

	const stickToBottom = useCallback(
		(force: boolean) => {
			const el = scrollElRef.current;
			if (!el) return;
			if (!force && !isActive()) return;
			if (force && userScrolledRef.current) {
				userScrolledRef.current = false;
				setUserScrolled(false);
			}
			if (!force && userScrolledRef.current) return;

			const distance = distanceFromBottom(el);
			if (distance < 2) {
				markAuto(el);
				return;
			}
			markAuto(el);
			el.scrollTop = el.scrollHeight;
		},
		[markAuto],
	);

	const pause = useCallback(() => {
		const el = scrollElRef.current;
		if (!el) return;
		if (!canScroll(el)) {
			if (userScrolledRef.current) {
				userScrolledRef.current = false;
				setUserScrolled(false);
			}
			return;
		}
		if (userScrolledRef.current) return;
		userScrolledRef.current = true;
		setUserScrolled(true);
		onUserInteracted?.();
	}, [onUserInteracted]);

	const handleScroll = useCallback(() => {
		const el = scrollElRef.current;
		if (!el) return;

		if (!canScroll(el)) {
			if (userScrolledRef.current) {
				userScrolledRef.current = false;
				setUserScrolled(false);
			}
			return;
		}

		if (distanceFromBottom(el) < bottomThreshold) {
			if (userScrolledRef.current) {
				userScrolledRef.current = false;
				setUserScrolled(false);
			}
			return;
		}

		if (!userScrolledRef.current && isAutoEvent(el)) {
			stickToBottom(false);
			return;
		}

		pause();
	}, [bottomThreshold, isAutoEvent, pause, stickToBottom]);

	const handleInteraction = useCallback(() => {
		if (!isActive()) return;
		const selection = window.getSelection();
		if (selection && selection.toString().length > 0) {
			pause();
		}
	}, [pause]);

	const scrollRef = useCallback((el: HTMLElement | null) => {
		scrollElRef.current = el;
	}, []);
	const contentRef = useCallback((el: HTMLElement | null) => {
		contentElRef.current = el;
	}, []);

	// working → true: scroll to bottom (force). working → false: settle window.
	useEffect(() => {
		settlingRef.current = false;
		if (settleTimerRef.current) {
			clearTimeout(settleTimerRef.current);
			settleTimerRef.current = null;
		}
		if (working) {
			if (!userScrolledRef.current) stickToBottom(true);
			return;
		}
		settlingRef.current = true;
		settleTimerRef.current = setTimeout(() => {
			settlingRef.current = false;
		}, 300);
		return () => {
			if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
		};
	}, [working, stickToBottom]);

	// Track content-size changes (streaming deltas, tool cards expanding)
	// and keep the bottom locked while active + not paused.
	useEffect(() => {
		const contentEl = contentElRef.current;
		if (!contentEl) return;
		const observer = new ResizeObserver(() => {
			const scrollEl = scrollElRef.current;
			if (scrollEl && !canScroll(scrollEl)) {
				if (userScrolledRef.current) {
					userScrolledRef.current = false;
					setUserScrolled(false);
				}
				return;
			}
			if (!isActive()) return;
			if (userScrolledRef.current) return;
			stickToBottom(false);
		});
		observer.observe(contentEl);
		return () => observer.disconnect();
	}, [stickToBottom]);

	// Wheel handler — ignore wheel inside nested data-scrollable so tool
	// output / code block scrolling doesn't un-stick the outer surface.
	useEffect(() => {
		const el = scrollElRef.current;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			if (e.deltaY >= 0) return;
			if (isInsideNestedScrollable(e.target, el)) return;
			pause();
		};
		el.addEventListener("wheel", onWheel, { passive: true });
		return () => el.removeEventListener("wheel", onWheel);
	}, [pause]);

	// Overflow-anchor CSS — "none" while we're pinning ourselves so the
	// browser doesn't fight us on scroll restoration.
	useEffect(() => {
		const el = scrollElRef.current;
		if (!el) return;
		el.style.overflowAnchor = userScrolled ? "auto" : "none";
	}, [userScrolled]);

	// Content-signal follower — more reliable than ResizeObserver for
	// streaming deltas. When the signal changes and we're active + not
	// paused, scroll to bottom. Double rAF to let React commit + paint
	// the new content before we measure.
	useEffect(() => {
		if (contentSignal === undefined) return;
		if (!isActive()) return;
		if (userScrolledRef.current) return;
		const raf1 = requestAnimationFrame(() => {
			const raf2 = requestAnimationFrame(() => {
				stickToBottom(false);
			});
			(raf1 as unknown as { next?: number }).next = raf2;
		});
		return () => {
			cancelAnimationFrame(raf1);
			const next = (raf1 as unknown as { next?: number }).next;
			if (typeof next === "number") cancelAnimationFrame(next);
		};
		// `working` in deps so we also scroll on the idle→busy flip.
	}, [contentSignal, working, stickToBottom]);

	useEffect(() => {
		return () => {
			if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
			if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
		};
	}, []);

	const resume = useCallback(() => {
		if (userScrolledRef.current) {
			userScrolledRef.current = false;
			setUserScrolled(false);
		}
		stickToBottom(true);
	}, [stickToBottom]);

	const scrollToBottomExposed = useCallback(
		() => stickToBottom(false),
		[stickToBottom],
	);
	const forceScrollToBottom = useCallback(
		() => stickToBottom(true),
		[stickToBottom],
	);

	return {
		scrollRef,
		contentRef,
		handleScroll,
		handleInteraction,
		pause,
		resume,
		scrollToBottom: scrollToBottomExposed,
		forceScrollToBottom,
		userScrolled,
	};
}
