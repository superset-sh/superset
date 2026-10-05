import {
	type PointerEventHandler,
	type RefObject,
	type TouchEventHandler,
	type UIEventHandler,
	useCallback,
	useEffect,
	useRef,
	type WheelEventHandler,
} from "react";

const STICKY_BOTTOM_THRESHOLD_PX = 4;
const USER_SCROLL_INTENT_MS = 350;
const SMOOTH_SCROLL_MIN_GAP_MS = 250;
const SCROLL_KEYS = new Set([
	"ArrowUp",
	"ArrowDown",
	"PageUp",
	"PageDown",
	"Home",
	"End",
	" ",
]);

export type StickyBottomScrollBinding = {
	contentRef: RefObject<HTMLDivElement | null>;
	onPointerDown: PointerEventHandler<HTMLDivElement>;
	onScroll: UIEventHandler<HTMLDivElement>;
	onTouchMove: TouchEventHandler<HTMLDivElement>;
	onTouchStart: TouchEventHandler<HTMLDivElement>;
	onWheel: WheelEventHandler<HTMLDivElement>;
};

function maxScrollOffset(element: HTMLElement): number {
	return Math.max(0, element.scrollHeight - element.clientHeight);
}

function prefersReducedMotion(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Keeps a scroll box pinned to its bottom while content streams in, and lets
 * go the moment the reader scrolls away on purpose: a wheel, a touch, a
 * pointer drag or a scrolling key marks intent, a programmatic scroll does
 * not. Scrolling back within a few pixels of the bottom pins it again.
 */
export function useStickyBottomScroll({
	contentKey,
	scrollRef,
	streaming,
}: {
	scrollRef: RefObject<HTMLDivElement | null>;
	contentKey: string;
	streaming: boolean;
}): StickyBottomScrollBinding {
	const contentRef = useRef<HTMLDivElement>(null);
	const stickRef = useRef(true);
	const pointerIntentRef = useRef(false);
	const intentUntilRef = useRef(0);
	const lastScrollAtRef = useRef(0);
	const firstScrollRef = useRef(true);
	const wasStreamingRef = useRef(streaming);
	const followedStreamRef = useRef(streaming);
	const maxOffsetRef = useRef(0);

	useEffect(() => {
		const element = scrollRef.current;
		if (!element) return;
		maxOffsetRef.current = maxScrollOffset(element);
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => {
			maxOffsetRef.current = maxScrollOffset(element);
			if (followedStreamRef.current && stickRef.current) {
				element.scrollTop = maxOffsetRef.current;
			}
		});
		observer.observe(element);
		if (contentRef.current) observer.observe(contentRef.current);
		return () => observer.disconnect();
	}, [scrollRef]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: contentKey is the trigger, not an input
	useEffect(() => {
		const wasStreaming = wasStreamingRef.current;
		wasStreamingRef.current = streaming;
		if (streaming) followedStreamRef.current = true;
		if (!streaming && !wasStreaming) return;
		const element = scrollRef.current;
		if (!element || !stickRef.current) return;
		const now = performance.now();
		const top = maxScrollOffset(element);
		maxOffsetRef.current = top;
		const smooth =
			!firstScrollRef.current &&
			now - lastScrollAtRef.current >= SMOOTH_SCROLL_MIN_GAP_MS &&
			!prefersReducedMotion();
		if (smooth) element.scrollTo({ top, behavior: "smooth" });
		else element.scrollTop = top;
		lastScrollAtRef.current = now;
		firstScrollRef.current = false;
	}, [contentKey, scrollRef, streaming]);

	const markIntent = useCallback(() => {
		intentUntilRef.current = performance.now() + USER_SCROLL_INTENT_MS;
	}, []);
	const onPointerDown = useCallback<PointerEventHandler<HTMLDivElement>>(() => {
		pointerIntentRef.current = true;
	}, []);
	useEffect(() => {
		const element = scrollRef.current;
		if (!element) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (SCROLL_KEYS.has(event.key)) markIntent();
		};
		element.addEventListener("keydown", onKeyDown);
		return () => element.removeEventListener("keydown", onKeyDown);
	}, [markIntent, scrollRef]);
	const onScroll = useCallback<UIEventHandler<HTMLDivElement>>((event) => {
		if (
			maxOffsetRef.current - event.currentTarget.scrollTop <=
			STICKY_BOTTOM_THRESHOLD_PX
		) {
			stickRef.current = true;
			return;
		}
		if (pointerIntentRef.current || performance.now() <= intentUntilRef.current)
			stickRef.current = false;
	}, []);

	useEffect(() => {
		if (!streaming) return;
		const release = () => {
			pointerIntentRef.current = false;
		};
		window.addEventListener("pointerup", release);
		window.addEventListener("pointercancel", release);
		return () => {
			window.removeEventListener("pointerup", release);
			window.removeEventListener("pointercancel", release);
		};
	}, [streaming]);

	return {
		contentRef,
		onPointerDown,
		onScroll,
		onTouchMove: markIntent,
		onTouchStart: markIntent,
		onWheel: markIntent,
	};
}
