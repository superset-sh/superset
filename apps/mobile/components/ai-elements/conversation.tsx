import {
	LegendList,
	type LegendListProps,
	type LegendListRef,
} from "@legendapp/list/react-native";
import { ArrowDownIcon } from "lucide-react-native";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import type {
	LayoutChangeEvent,
	NativeScrollEvent,
	NativeSyntheticEvent,
} from "react-native";
import { Keyboard, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useResolveClassNames } from "uniwind";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const AT_BOTTOM_THRESHOLD = 48;
/** Fallback in case the anchor scroll never reports a momentum end. */
const ANCHOR_SETTLE_FALLBACK_MS = 900;
/** Trailing scroll range kept banked near the end of content — see
 * syncSpacer. Must exceed the largest transient content dip streaming
 * re-measurement produces (observed ~40pt). */
const SPACER_SLACK = 80;
/** Fallback row height while a tail item is still unmeasured. */
const ESTIMATED_TAIL_ITEM = 60;
const ANCHOR_MEASURE_ATTEMPTS = 8;
/** Extra animated legs the anchor may take after the first lands off-target
 * (estimated heights over unmeasured history shift the goalposts). */
const ANCHOR_SETTLE_MAX_ROUNDS = 2;
/** Final non-animated snap distance for an anchor that settled nearly right. */
const ANCHOR_SNAP_TOLERANCE = 24;
/** The settle fallback only fires once scrolling has been quiet this long —
 * a long anchor animation must not be mistaken for a settled one. */
const ANCHOR_QUIET_MS = 250;
/** End-drag velocity below which no momentum phase is expected (pt/ms). */
const REST_VELOCITY = 0.1;
/** First-paint veil: the list mounts invisible and reveals only once the
 * content has been quiet this long — by then the initial page is measured
 * and the pinned follow has parked it flush at the bottom, so the first
 * VISIBLE frame is a full screen of the newest messages, never the top of
 * history mid-measurement. */
const REVEAL_QUIET_MS = 150;
/** Reveal no matter what after this — an actively streaming thread never
 * goes quiet, and nothing may hold the first paint hostage. */
const REVEAL_CAP_MS = 800;

/** Scroll-discipline tracing (flip on when debugging with the lab). */
const DEBUG_SCROLL = false;
function dbg(...args: unknown[]) {
	if (DEBUG_SCROLL) console.log("[conv]", ...args);
}

interface ConversationContextType {
	isAtBottom: boolean;
	scrollToBottom: () => void;
}

const ConversationContext = createContext<ConversationContextType | null>(null);

export const useConversation = () => {
	const context = useContext(ConversationContext);

	if (!context) {
		throw new Error("Conversation components must be used within Conversation");
	}

	return context;
};

/** Snapshot of the scroll bookkeeping — lab/regression-test surface. */
export interface ConversationScrollState {
	contentH: number;
	isAtBottom: boolean;
	offset: number;
	pinned: boolean;
	rawContentH: number;
	spacer: number;
	viewportH: number;
}

export interface ConversationController {
	/**
	 * ChatGPT-style send anchor: scrolls the item at `index` (the just-sent
	 * user message) to the top of the viewport and leaves whitespace below
	 * for the reply to stream into. Follow-to-bottom stays OFF afterwards —
	 * the reader re-arms it by scrolling to the end or tapping the button.
	 */
	scrollToAnchor: (index: number) => void;
	/** Lab/regression-test surface (see the conversation-lab debug screen) —
	 * not for product code. */
	getScrollState: () => ConversationScrollState;
	scrollTo: (offset: number, animated: boolean) => void;
	setPinned: (pinned: boolean) => void;
}

export type ConversationProps<ItemT> = Omit<
	LegendListProps<ItemT>,
	"children" | "data" | "renderItem"
> & {
	data: readonly ItemT[];
	renderItem: LegendListProps<ItemT>["renderItem"];
	className?: string;
	contentContainerClassName?: string;
	children?: React.ReactNode;
	/** Distance from the viewport top an anchored item rests at (header inset). */
	anchorOffsetTop?: number;
	/** The content container's paddingBottom — part of the distance between
	 * the last item and the native content end. */
	contentPaddingBottom?: number;
	controllerRef?: React.Ref<ConversationController>;
};

/**
 * Chat scroll discipline (the "soft pin" everyone expects from ChatGPT/Claude
 * mobile), implemented around one invariant — the list only ever moves when
 * the user asked it to:
 *
 * - Follow-to-bottom is ON only while `pinned`. A drag start unpins
 *   instantly (an upward swipe never fights the autoscroll); ending a
 *   drag/momentum at the bottom re-pins; the scroll-down button re-pins.
 *   Programmatic/streaming scroll events never re-pin by themselves.
 * - Trailing scroll range is banked as a native bottom contentInset (NOT a
 *   spacer view: content-size and child-layout events arrive out of phase,
 *   and deriving "content minus spacer" from them oscillates). The inset
 *   keeps the current offset valid through bottom overlays resolving, the
 *   keyboard hiding, content dips, and the send anchor — the stream then
 *   consumes the range in place, so the view never moves involuntarily.
 * - Viewport SHRINK while pinned (keyboard up, permission stack in) re-pins
 *   to keep the newest content visible; viewport GROWTH never moves content.
 */
export const Conversation = <ItemT,>({
	data,
	renderItem,
	className,
	contentContainerClassName,
	contentContainerStyle,
	onScroll,
	children,
	anchorOffsetTop = 0,
	contentPaddingBottom = 0,
	controllerRef,
	ListFooterComponent,
	...listProps
}: ConversationProps<ItemT>) => {
	const listRef = useRef<LegendListRef>(null);
	const [isAtBottom, setIsAtBottom] = useState(true);
	const [spacer, setSpacer] = useState(0);
	const [revealed, setRevealed] = useState(false);
	const revealedRef = useRef(false);
	const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const resolvedContentContainerStyle = useResolveClassNames(
		contentContainerClassName ?? "",
	);

	const pinnedRef = useRef(true);
	const isDraggingRef = useRef(false);
	const offsetRef = useRef(0);
	const viewportHRef = useRef(0);
	/** Viewport height as of the last onLayout — the shrink/growth branches
	 * compare against this, never viewportHRef (scroll events update that). */
	const lastLayoutHRef = useRef(0);
	/** Largest viewport this screen has had — the spacer banks scroll range
	 * against THIS height so a bottom overlay leaving never clamps. */
	const maxViewportHRef = useRef(0);
	const contentHRef = useRef(0);
	const spacerRef = useRef(0);
	/** While an anchor scroll is in flight the spacer holds a full-viewport
	 * floor so the scroll target exists; released when the scroll settles. */
	const anchorFloorRef = useRef(false);
	const anchorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	/** Anchor scroll waiting for the just-sent tail to measure. */
	const pendingAnchorRef = useRef(false);
	/** Last anchor target, for the settle snap (animated scrollTo lands a few
	 * points off; the final non-animated snap makes the anchor exact). */
	const anchorTargetRef = useRef<number | null>(null);
	/** The anchored item, kept until the anchor fully settles so the target
	 * can be recomputed from fresh measurements at each settle round. The KEY
	 * is the identity — pagination can prepend rows mid-anchor and shift
	 * every index (the index is the fallback when no keyExtractor exists). */
	const anchorIndexRef = useRef<number | null>(null);
	const anchorKeyRef = useRef<string | null>(null);
	const anchorSettleRoundsRef = useRef(0);
	const lastScrollAtRef = useRef(0);
	/** Provided footer height, measured natively. */
	const footerHRef = useRef(0);
	const dataLengthRef = useRef(0);
	const dataRef = useRef<readonly ItemT[]>(data);
	const keyExtractorRef = useRef<
		((item: ItemT, index: number) => string) | undefined
	>(undefined);
	/** Viewport growth from the keyboard sliding away reads as "the sheet
	 * left", not "the chat scrolled" — those growths keep following. */
	const keyboardHidingRef = useRef(false);
	/** True from drag-begin until that gesture's momentum dies. Re-pinning is
	 * gated on it: programmatic scrolls also emit momentum-end events, and
	 * only the USER coming to rest at the bottom may re-arm following. */
	const gestureRef = useRef(false);

	useEffect(() => {
		const willHide = Keyboard.addListener("keyboardWillHide", () => {
			keyboardHidingRef.current = true;
		});
		const didHide = Keyboard.addListener("keyboardDidHide", () => {
			setTimeout(() => {
				keyboardHidingRef.current = false;
			}, 100);
		});
		return () => {
			willHide.remove();
			didHide.remove();
			if (anchorTimerRef.current) clearTimeout(anchorTimerRef.current);
		};
	}, []);

	const setPinnedBoth = useCallback((value: boolean) => {
		pinnedRef.current = value;
	}, []);

	const reveal = useCallback(() => {
		if (revealedRef.current) return;
		revealedRef.current = true;
		if (revealTimerRef.current) {
			clearTimeout(revealTimerRef.current);
			revealTimerRef.current = null;
		}
		setRevealed(true);
	}, []);

	/** Every content change re-arms the quiet gate; once the initial page
	 * stops measuring, the follow has already parked us at the end. */
	const armRevealCheck = useCallback(() => {
		if (revealedRef.current) return;
		if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
		revealTimerRef.current = setTimeout(reveal, REVEAL_QUIET_MS);
	}, [reveal]);

	useEffect(() => {
		const cap = setTimeout(reveal, REVEAL_CAP_MS);
		return () => {
			clearTimeout(cap);
			if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
		};
	}, [reveal]);

	/** The native content height. The spacer lives in contentInset, never in
	 * the content itself, so no subtraction (and no phase mixing) is needed. */
	const rawContentH = useCallback(() => contentHRef.current, []);

	const applySpacer = useCallback((next: number) => {
		if (Math.abs(next - spacerRef.current) >= 1) {
			spacerRef.current = next;
			setSpacer(next);
		}
	}, []);

	/**
	 * Spacer maintenance, run on CONTENT and discrete LAYOUT events — never on
	 * scroll events (coupling it to scroll makes iOS bounce feed back into the
	 * content size and the list goes haywire).
	 *
	 * The scroll range a resting reader occupies must exist BEFORE anything
	 * takes it away: iOS clamps the offset natively, in the same frame the
	 * content shrinks or the viewport grows, so reacting afterwards is always
	 * one frame too late and the view visibly yanks. Two consequences:
	 * - the target is computed against the LARGEST viewport this screen has
	 *   had (`maxViewportHRef`), so a bottom overlay (permission stack,
	 *   keyboard) leaving never clamps — the range it frees is pre-banked;
	 * - near the end an extra SPACER_SLACK absorbs transient content dips
	 *   (streaming re-measure shrinks content by a few dozen points before
	 *   growing back).
	 * As content streams in, the target shrinks in lockstep, so the spacer is
	 * consumed in place and the view never moves; away from the end the
	 * spacer is 0 and the list behaves like a plain scroll view.
	 */
	const syncSpacer = useCallback(() => {
		const floor = anchorFloorRef.current ? viewportHRef.current : 0;
		const protectedNeed =
			offsetRef.current + maxViewportHRef.current - rawContentH();
		const target =
			protectedNeed > -SPACER_SLACK
				? Math.max(0, protectedNeed) + SPACER_SLACK
				: 0;
		const next = Math.max(floor, target);
		dbg("syncSpacer", {
			floor,
			from: Math.round(spacerRef.current),
			offset: Math.round(offsetRef.current),
			protectedNeed: Math.round(protectedNeed),
			raw: Math.round(rawContentH()),
			to: Math.round(next),
		});
		applySpacer(next);
	}, [applySpacer, rawContentH]);

	/**
	 * Follow-to-bottom target. NEVER LegendList's scrollToEnd: that computes
	 * the target from its internal ESTIMATED total size, which after a
	 * remount/replay can exceed the laid-out content by thousands of points —
	 * and iOS setContentOffset doesn't clamp, so the view parks in blank
	 * space. The native-reported content height is the truth.
	 */
	const scrollToMeasuredEnd = useCallback(
		(animated: boolean) => {
			// The RAW end: the spacer keeps banked blank range past the true
			// content, and "the bottom" the reader means is the newest content.
			const target = Math.max(0, rawContentH() - viewportHRef.current);
			dbg("scrollToMeasuredEnd", { animated, target: Math.round(target) });
			void listRef.current?.scrollToOffset({ animated, offset: target });
		},
		[rawContentH],
	);

	const updateIsAtBottom = useCallback(() => {
		// Before the first layout the viewport reads as 0 and every distance
		// looks huge — keep the initial at-bottom assumption until measured.
		if (viewportHRef.current === 0) return;
		// Distance to the TRUE end of content — the spacer is blank, being
		// "in" it still counts as at-bottom so the button stays hidden.
		const distance = rawContentH() - viewportHRef.current - offsetRef.current;
		setIsAtBottom(distance < AT_BOTTOM_THRESHOLD);
	}, [rawContentH]);

	const readScrollEvent = useCallback(
		(event: NativeSyntheticEvent<NativeScrollEvent>) => {
			const { contentOffset, contentSize, layoutMeasurement } =
				event.nativeEvent;
			offsetRef.current = contentOffset.y;
			contentHRef.current = contentSize.height;
			viewportHRef.current = layoutMeasurement.height;
		},
		[],
	);

	const handleScroll = useCallback(
		(event: NativeSyntheticEvent<NativeScrollEvent>) => {
			readScrollEvent(event);
			lastScrollAtRef.current = Date.now();
			dbg("scroll", {
				offset: Math.round(offsetRef.current),
				contentH: Math.round(contentHRef.current),
				viewport: Math.round(viewportHRef.current),
			});
			updateIsAtBottom();
			onScroll?.(event);
		},
		[onScroll, readScrollEvent, updateIsAtBottom],
	);

	/** Aborts an in-flight send anchor without another scroll — the current
	 * offset is preserved (syncSpacer keeps its range valid). */
	const cancelAnchor = useCallback(() => {
		if (anchorTimerRef.current) {
			clearTimeout(anchorTimerRef.current);
			anchorTimerRef.current = null;
		}
		pendingAnchorRef.current = false;
		anchorFloorRef.current = false;
		anchorTargetRef.current = null;
		anchorIndexRef.current = null;
		anchorKeyRef.current = null;
		anchorSettleRoundsRef.current = 0;
		syncSpacer();
	}, [syncSpacer]);

	const handleScrollBeginDrag = useCallback(() => {
		isDraggingRef.current = true;
		gestureRef.current = true;
		// The user took the wheel: any programmatic following stops NOW —
		// including an anchor mid-flight (its settle legs must never fight
		// the drag).
		setPinnedBoth(false);
		if (anchorFloorRef.current || pendingAnchorRef.current) {
			cancelAnchor();
		}
	}, [cancelAnchor, setPinnedBoth]);

	/** Re-pin only when a user-driven scroll comes to rest AT the true end of
	 * content (two-sided: deep inside banked blank space doesn't count), and
	 * never while an anchor scroll is still in flight — its momentum-end
	 * fires here, and following would yank the fresh anchor to the bottom. */
	const evaluateRestingPin = useCallback(
		(event: NativeSyntheticEvent<NativeScrollEvent>) => {
			readScrollEvent(event);
			if (anchorFloorRef.current) return;
			const distance = rawContentH() - viewportHRef.current - offsetRef.current;
			dbg("restingPin", { distance: Math.round(distance) });
			if (Math.abs(distance) < AT_BOTTOM_THRESHOLD) {
				setPinnedBoth(true);
			}
		},
		[rawContentH, readScrollEvent, setPinnedBoth],
	);

	const handleScrollEndDrag = useCallback(
		(event: NativeSyntheticEvent<NativeScrollEvent>) => {
			isDraggingRef.current = false;
			// A fling isn't at rest yet — momentum-end evaluates it. Only a
			// finger-up with no residual velocity settles the gesture here.
			const velocity = Math.abs(event.nativeEvent.velocity?.y ?? 0);
			if (velocity < REST_VELOCITY) {
				gestureRef.current = false;
				evaluateRestingPin(event);
			}
		},
		[evaluateRestingPin],
	);

	/**
	 * Anchor target computed FROM THE BOTTOM, in native coordinates only:
	 * `content end − paddingBottom − footer − tail items` is exact for the
	 * freshly measured tail, while absolute item positions
	 * (`positionAtIndex`/`scrollToIndex`) lean on estimates for every
	 * unmeasured item above and can land pages away. Note contentH itself
	 * still contains estimates for unmounted MIDDLE items (reader far up in
	 * history), so a target can be off until the scroll passes through and
	 * measures them — the settle rounds below correct for that.
	 */
	const computeAnchorTarget = useCallback(
		(index: number): { allMeasured: boolean; target: number } | null => {
			const list = listRef.current;
			if (!list) return null;
			const state = list.getState();
			let tail = 0;
			let allMeasured = true;
			for (let i = index; i < dataLengthRef.current; i += 1) {
				const size = state.sizeAtIndex(i);
				if (Number.isFinite(size) && size > 0) {
					tail += size;
				} else {
					allMeasured = false;
					tail += ESTIMATED_TAIL_ITEM;
				}
			}
			return {
				allMeasured,
				target: Math.max(
					0,
					contentHRef.current -
						contentPaddingBottom -
						footerHRef.current -
						tail -
						anchorOffsetTop,
				),
			};
		},
		[anchorOffsetTop, contentPaddingBottom],
	);

	/** Re-resolve the anchored item's index — pagination can prepend rows
	 * mid-anchor, shifting every index under a stored number. */
	const resolveAnchorIndex = useCallback((): number | null => {
		const key = anchorKeyRef.current;
		const extract = keyExtractorRef.current;
		if (key !== null && extract !== undefined) {
			const items = dataRef.current;
			// The anchor is a just-sent message — scan from the end.
			for (let index = items.length - 1; index >= 0; index -= 1) {
				if (extract(items[index], index) === key) return index;
			}
			return null;
		}
		return anchorIndexRef.current;
	}, []);

	const settleAnchor = useCallback(
		(fromTimer = false) => {
			if (!anchorFloorRef.current) return;
			// A slow far-history leg outlives the fallback timer — only settle
			// from the timer once scrolling has actually gone quiet.
			if (fromTimer && Date.now() - lastScrollAtRef.current < ANCHOR_QUIET_MS) {
				if (anchorTimerRef.current) clearTimeout(anchorTimerRef.current);
				anchorTimerRef.current = setTimeout(
					() => settleAnchor(true),
					ANCHOR_QUIET_MS,
				);
				return;
			}
			if (anchorTimerRef.current) {
				clearTimeout(anchorTimerRef.current);
				anchorTimerRef.current = null;
			}
			const index = resolveAnchorIndex();
			const fresh = index !== null ? computeAnchorTarget(index) : null;
			const target = fresh?.target ?? anchorTargetRef.current;
			dbg("settleAnchor", {
				offset: Math.round(offsetRef.current),
				round: anchorSettleRoundsRef.current,
				target: target === null ? null : Math.round(target),
			});
			// The first leg aimed at a target computed from ESTIMATED heights for
			// any unmounted history between the reader and the end; scrolling
			// through measured them, so recompute — if the goalposts moved more
			// than a snap's worth, run a short corrective leg before releasing.
			if (
				target !== null &&
				Math.abs(offsetRef.current - target) > ANCHOR_SNAP_TOLERANCE &&
				anchorSettleRoundsRef.current < ANCHOR_SETTLE_MAX_ROUNDS
			) {
				anchorSettleRoundsRef.current += 1;
				anchorTargetRef.current = target;
				anchorTimerRef.current = setTimeout(
					() => settleAnchor(true),
					ANCHOR_SETTLE_FALLBACK_MS,
				);
				void listRef.current?.scrollToOffset({
					animated: true,
					offset: target,
				});
				return;
			}
			anchorFloorRef.current = false;
			anchorTargetRef.current = null;
			anchorIndexRef.current = null;
			anchorKeyRef.current = null;
			anchorSettleRoundsRef.current = 0;
			// Animated scrollTo settles a few points off target — snap the last
			// bit so the anchored message sits exactly where it should.
			if (
				target !== null &&
				Math.abs(offsetRef.current - target) <= ANCHOR_SNAP_TOLERANCE
			) {
				void listRef.current?.scrollToOffset({
					animated: false,
					offset: target,
				});
				offsetRef.current = target;
			}
			syncSpacer();
		},
		[computeAnchorTarget, resolveAnchorIndex, syncSpacer],
	);

	const handleMomentumScrollEnd = useCallback(
		(event: NativeSyntheticEvent<NativeScrollEvent>) => {
			settleAnchor();
			// Programmatic scrolls emit momentum-end too — only a user
			// gesture coming to rest may re-pin.
			if (!isDraggingRef.current && gestureRef.current) {
				gestureRef.current = false;
				evaluateRestingPin(event);
			}
		},
		[evaluateRestingPin, settleAnchor],
	);

	const handleContentSizeChange = useCallback(
		(_width: number, height: number) => {
			contentHRef.current = height;
			dbg("contentSize", {
				height: Math.round(height),
				raw: Math.round(rawContentH()),
				spacer: Math.round(spacerRef.current),
				offset: Math.round(offsetRef.current),
				pinned: pinnedRef.current,
			});
			updateIsAtBottom();
			syncSpacer();
			// Manual follow-to-bottom. Gated on refs, not props, so a stream
			// chunk landing mid-gesture or mid-anchor can never race a stale
			// list-level autoscroll into motion the user didn't ask for.
			if (
				pinnedRef.current &&
				!isDraggingRef.current &&
				!anchorFloorRef.current
			) {
				scrollToMeasuredEnd(false);
			}
			armRevealCheck();
		},
		[
			armRevealCheck,
			rawContentH,
			scrollToMeasuredEnd,
			syncSpacer,
			updateIsAtBottom,
		],
	);

	const handleLayout = useCallback(
		(event: LayoutChangeEvent) => {
			const nextHeight = event.nativeEvent.layout.height;
			// Compare against the last LAYOUT height, not viewportHRef — scroll
			// events also carry the viewport and would consume the transition
			// before this handler could branch on it.
			const previousHeight = lastLayoutHRef.current;
			lastLayoutHRef.current = nextHeight;
			viewportHRef.current = nextHeight;
			maxViewportHRef.current = Math.max(maxViewportHRef.current, nextHeight);
			dbg("layout", {
				prev: Math.round(previousHeight),
				next: Math.round(nextHeight),
				pinned: pinnedRef.current,
				kbHiding: keyboardHidingRef.current,
				offset: Math.round(offsetRef.current),
				spacer: Math.round(spacerRef.current),
			});
			if (previousHeight === 0) {
				updateIsAtBottom();
				return;
			}
			if (nextHeight < previousHeight) {
				if (pinnedRef.current) {
					// Keyboard up / permission stack in: keep the newest content
					// visible above the shrunken bottom edge.
					scrollToMeasuredEnd(false);
				}
				// Anchored readers: nothing moves — the banked spacer already
				// covers the range, syncSpacer just re-evaluates the target.
				syncSpacer();
			} else if (nextHeight > previousHeight) {
				if (pinnedRef.current && keyboardHidingRef.current) {
					scrollToMeasuredEnd(false);
				} else {
					if (pinnedRef.current) {
						// Viewport grew back (permission stack resolved). Re-pinning
						// would shift the chat down to fill the gap — pause
						// following instead; the reader re-arms with a scroll or
						// the button.
						setPinnedBoth(false);
					}
					// The banked spacer already covers the freed range (iOS
					// clamps in the same frame, so growing it NOW would be too
					// late) — the stream consumes the space in place.
					syncSpacer();
				}
			}
			updateIsAtBottom();
		},
		[scrollToMeasuredEnd, setPinnedBoth, syncSpacer, updateIsAtBottom],
	);

	const scrollToBottom = useCallback(() => {
		// Going to the true bottom: drop any leftover anchor whitespace first
		// so "the end" is the newest content, not blank space.
		anchorFloorRef.current = false;
		spacerRef.current = 0;
		setSpacer(0);
		setPinnedBoth(true);
		requestAnimationFrame(() => {
			// The content height still includes the spacer until the removal
			// lays out — target the true end, not the stale total.
			const target = Math.max(0, rawContentH() - viewportHRef.current);
			dbg("scrollToBottom", { target: Math.round(target) });
			void listRef.current?.scrollToOffset({ animated: true, offset: target });
		});
	}, [rawContentH, setPinnedBoth]);

	/** First anchor leg: wait (a few frames) for the just-sent tail to
	 * measure, then scroll to the computed target. */
	const firePendingAnchorScroll = useCallback(
		(attempt = 0) => {
			if (!pendingAnchorRef.current) return;
			const index = resolveAnchorIndex();
			if (index === null) {
				// The anchored item left the data — nothing to anchor to.
				cancelAnchor();
				return;
			}
			const computed = computeAnchorTarget(index);
			if (computed === null) return;
			if (!computed.allMeasured && attempt < ANCHOR_MEASURE_ATTEMPTS) {
				requestAnimationFrame(() => firePendingAnchorScroll(attempt + 1));
				return;
			}
			pendingAnchorRef.current = false;
			anchorIndexRef.current = index;
			anchorTargetRef.current = computed.target;
			dbg("anchorScroll", {
				attempt,
				contentH: Math.round(contentHRef.current),
				footerH: Math.round(footerHRef.current),
				target: Math.round(computed.target),
			});
			void listRef.current?.scrollToOffset({
				animated: true,
				offset: computed.target,
			});
		},
		[cancelAnchor, computeAnchorTarget, resolveAnchorIndex],
	);

	useImperativeHandle(
		controllerRef,
		() => ({
			scrollToAnchor: (index: number) => {
				dbg("scrollToAnchor", { index });
				setPinnedBoth(false);
				anchorFloorRef.current = true;
				pendingAnchorRef.current = true;
				anchorIndexRef.current = index;
				// Anchor by key when possible — pagination can prepend rows
				// mid-anchor and shift every index.
				const item = dataRef.current[index];
				const extract = keyExtractorRef.current;
				anchorKeyRef.current =
					item !== undefined && extract !== undefined
						? extract(item, index)
						: null;
				anchorSettleRoundsRef.current = 0;
				// Full-viewport floor: guarantees the scroll range to put the
				// message at the top exists no matter how short the thread is.
				// The inset is a native prop — no layout pass to wait for.
				applySpacer(Math.max(spacerRef.current, viewportHRef.current));
				if (anchorTimerRef.current) clearTimeout(anchorTimerRef.current);
				anchorTimerRef.current = setTimeout(
					() => settleAnchor(true),
					ANCHOR_SETTLE_FALLBACK_MS,
				);
				requestAnimationFrame(() => firePendingAnchorScroll());
			},
			getScrollState: () => ({
				contentH: contentHRef.current,
				isAtBottom:
					rawContentH() - viewportHRef.current - offsetRef.current <
					AT_BOTTOM_THRESHOLD,
				offset: offsetRef.current,
				pinned: pinnedRef.current,
				rawContentH: rawContentH(),
				spacer: spacerRef.current,
				viewportH: viewportHRef.current,
			}),
			scrollTo: (offset: number, animated: boolean) => {
				void listRef.current?.scrollToOffset({ animated, offset });
			},
			setPinned: (pinned: boolean) => {
				setPinnedBoth(pinned);
			},
		}),
		[
			applySpacer,
			firePendingAnchorScroll,
			rawContentH,
			setPinnedBoth,
			settleAnchor,
		],
	);

	const contextValue = useMemo(
		() => ({ isAtBottom, scrollToBottom }),
		[isAtBottom, scrollToBottom],
	);

	dataLengthRef.current = data.length;
	dataRef.current = data;
	keyExtractorRef.current = (
		listProps as { keyExtractor?: (item: ItemT, index: number) => string }
	).keyExtractor;

	const footer = (
		<View
			onLayout={(event) => {
				footerHRef.current = event.nativeEvent.layout.height;
			}}
		>
			{typeof ListFooterComponent === "function" ? (
				<ListFooterComponent />
			) : (
				(ListFooterComponent ?? null)
			)}
		</View>
	);

	return (
		<ConversationContext.Provider value={contextValue}>
			{/* Invisible (but laid out) until the first page settles at the
			    bottom — the first visible frame is the full newest page. */}
			<View
				className={cn("relative flex-1", className)}
				style={revealed ? undefined : { opacity: 0 }}
			>
				{/* Not alignItemsAtEnd: bottom-anchoring short threads means ANY item
				    growth (expanding a tool card) shoves the whole thread upward.
				    Top-aligned short threads grow downward instead, so the tapped
				    trigger stays put; long threads are unaffected. */}
				<LegendList
					data={data}
					keyboardShouldPersistTaps="handled"
					// No maintainScrollAtEnd and no initialScrollAtEnd: both make the
					// list chase its ESTIMATED end on later data changes (stale props /
					// re-armed end targets), overshooting the real content into blank
					// space. Follow-to-bottom is implemented manually in
					// handleContentSizeChange, gated on refs and the MEASURED end —
					// pinned starts true, so it also performs the initial scroll.
					recycleItems={false}
					renderItem={renderItem}
					{...listProps}
					// The banked trailing range (see syncSpacer). An inset, not a
					// spacer view: insets change no content sizes and fire no layout
					// events, so the bookkeeping can never feed back into itself.
					contentInset={{ bottom: spacer }}
					ListFooterComponent={footer}
					contentContainerStyle={
						contentContainerClassName
							? [resolvedContentContainerStyle, contentContainerStyle]
							: contentContainerStyle
					}
					onContentSizeChange={handleContentSizeChange}
					onLayout={handleLayout}
					onMomentumScrollEnd={handleMomentumScrollEnd}
					onScroll={handleScroll}
					onScrollBeginDrag={handleScrollBeginDrag}
					onScrollEndDrag={handleScrollEndDrag}
					ref={listRef}
				/>
				{children}
			</View>
		</ConversationContext.Provider>
	);
};

export type ConversationEmptyStateProps = React.ComponentProps<typeof View> & {
	title?: string;
	description?: string;
	icon?: React.ReactNode;
};

export const ConversationEmptyState = ({
	className,
	title = "No messages yet",
	description = "Start a conversation to see messages here",
	icon,
	children,
	...props
}: ConversationEmptyStateProps) => (
	<View
		className={cn(
			"size-full flex-1 flex-col items-center justify-center gap-3 p-8",
			className,
		)}
		{...props}
	>
		{children ?? (
			<>
				{icon && <View className="text-muted-foreground">{icon}</View>}
				<View className="items-center gap-1">
					<Text className="text-center font-medium text-sm">{title}</Text>
					{description && (
						<Text className="text-center text-muted-foreground text-sm">
							{description}
						</Text>
					)}
				</View>
			</>
		)}
	</View>
);

export type ConversationScrollButtonProps = ButtonProps;

export const ConversationScrollButton = ({
	className,
	children,
	...props
}: ConversationScrollButtonProps) => {
	const { isAtBottom, scrollToBottom } = useConversation();

	if (isAtBottom) {
		return null;
	}

	return (
		<Animated.View
			className="absolute right-0 bottom-4 left-0 items-center"
			entering={FadeIn.duration(150)}
			exiting={FadeOut.duration(150)}
			pointerEvents="box-none"
		>
			<Button
				accessibilityLabel="Scroll to bottom"
				className={cn("rounded-full", className)}
				onPress={scrollToBottom}
				size="icon"
				variant="outline"
				{...props}
			>
				{children ?? <Icon as={ArrowDownIcon} className="size-4" />}
			</Button>
		</Animated.View>
	);
};
