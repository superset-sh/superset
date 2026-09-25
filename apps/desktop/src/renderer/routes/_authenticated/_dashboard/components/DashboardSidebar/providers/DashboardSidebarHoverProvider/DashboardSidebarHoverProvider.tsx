import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import type { DashboardSidebarWorkspace } from "../../types";

const OPEN_DELAY_MS = 400;
const CLOSE_DELAY_MS = 100;
// Cap how long we'll tolerate the pointer drifting inside the safe triangle
// before giving up and closing anyway, in case it stalls mid-gap.
const SAFE_TRIANGLE_MAX_TRACK_MS = 1000;
// How long a row suppressed by another row's safe triangle waits before
// opening anyway. Covers the case where the pointer settles on this row
// instead of continuing on to the original card — without this, a
// suppressed open that never gets re-requested (mouseenter only fires once)
// would just never open.
const SUPPRESSED_OPEN_DWELL_MS = 150;

interface Point {
	x: number;
	y: number;
}

// Standard same-sign point-in-triangle test via cross-product signs.
function triangleSign(p1: Point, p2: Point, p3: Point): number {
	return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
}

function isPointInTriangle(pt: Point, a: Point, b: Point, c: Point): boolean {
	const d1 = triangleSign(pt, a, b);
	const d2 = triangleSign(pt, b, c);
	const d3 = triangleSign(pt, c, a);
	const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
	const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
	return !(hasNegative && hasPositive);
}

// The two corners of the card's near edge — the base of the safe triangle.
// The card is configured to render on the sidebar's right (side="right"),
// but Radix's collision avoidance (on by default; this popover doesn't
// disable it) can flip that to the left if there's more room there — a
// resizable sidebar dragged wide enough, or a narrow window, can trigger it.
// Read the resolved side straight off the element rather than assuming.
function getNearCardCorners(
	cardElement: HTMLElement,
	cardRect: DOMRect,
): [Point, Point] {
	const x =
		cardElement.getAttribute("data-side") === "left"
			? cardRect.right
			: cardRect.left;
	return [
		{ x, y: cardRect.top },
		{ x, y: cardRect.bottom },
	];
}

// Re-derives the triangle's base from the card's *current* rect on every
// call rather than a rect captured once when tracking started — the open
// card's bounds can keep changing after that (its CSS entrance transition,
// or content resizing as async data like diff stats loads in).
function isPointInsideCardCone(
	point: Point,
	apex: Point,
	cardElement: HTMLElement | null,
): boolean {
	if (!cardElement) return false;
	const [cornerA, cornerB] = getNearCardCorners(
		cardElement,
		cardElement.getBoundingClientRect(),
	);
	return isPointInTriangle(point, apex, cornerA, cornerB);
}

export interface DashboardSidebarHoverPayload {
	workspace: DashboardSidebarWorkspace;
	onEditBranchClick: (branchName: string) => void;
}

interface HoverState {
	hoveredId: string | null;
	anchorElement: HTMLElement | null;
	payload: DashboardSidebarHoverPayload | null;
}

interface HoverContextValue {
	hoveredId: string | null;
	anchorElement: HTMLElement | null;
	payload: DashboardSidebarHoverPayload | null;
	contextMenuOpen: boolean;
	hoverCardSuppressed: boolean;
	/**
	 * `enterPoint` (the pointer position entering this trigger) lets a safe
	 * triangle in progress for a *different* row suppress this open — rows
	 * are stacked with no gap, so cutting diagonally toward a taller open
	 * card routinely crosses over sibling rows on the way.
	 */
	requestOpen: (
		id: string,
		anchor: HTMLElement,
		payload: DashboardSidebarHoverPayload,
		enterPoint?: Point,
	) => void;
	/**
	 * `leavePoint` (the pointer position where it left the trigger) enables
	 * safe-triangle tracking: while the pointer keeps moving through the gap
	 * on a path aimed at the open card, the close is held off instead of
	 * firing the instant the trigger is left.
	 */
	requestClose: (id: string, leavePoint?: Point) => void;
	cancelClose: () => void;
	forceClose: () => void;
	setContextMenuOpen: (open: boolean) => void;
	beginHoverCardSuppression: () => void;
	endHoverCardSuppression: () => void;
	syncIfHovered: (id: string, payload: DashboardSidebarHoverPayload) => void;
	/**
	 * Registers the rendered card element so its rect can be read live, on
	 * demand — the popover has a CSS entrance transition, so a rect snapshot
	 * cached at mount time can go stale before its transform settles.
	 */
	setCardElement: (element: HTMLElement | null) => void;
}

const HoverContext = createContext<HoverContextValue | null>(null);

/**
 * The subset of the hover machine whose identities never change. Row-count
 * components (workspace rows, their context menus, chips) consume this
 * instead of the full context so a hovered-id commit doesn't re-render every
 * row in the sidebar; only the overlay needs the stateful context above.
 */
interface HoverActionsContextValue {
	requestOpen: HoverContextValue["requestOpen"];
	requestClose: HoverContextValue["requestClose"];
	cancelClose: () => void;
	forceClose: () => void;
	setContextMenuOpen: (open: boolean) => void;
	beginHoverCardSuppression: () => void;
	endHoverCardSuppression: () => void;
	syncIfHovered: HoverContextValue["syncIfHovered"];
	setCardElement: (element: HTMLElement | null) => void;
	/** Per-row hovered-state subscription backing useDashboardSidebarIsHovered. */
	subscribeHoveredId: (listener: () => void) => () => void;
	getHoveredId: () => string | null;
}

const HoverActionsContext = createContext<HoverActionsContextValue | null>(
	null,
);

export function DashboardSidebarHoverProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [state, setState] = useState<HoverState>({
		hoveredId: null,
		anchorElement: null,
		payload: null,
	});
	const [contextMenuOpen, setContextMenuOpen] = useState(false);
	// Counted, not boolean: overlapping holds (chip trigger hovered while its
	// hover card is open, adjacent chips) must not release each other early.
	const [suppressionCount, setSuppressionCount] = useState(0);
	// Mirror for the stable callbacks below: opens must check suppression at
	// call time (pointer events during drags), not at closure-creation time.
	const suppressionCountRef = useRef(0);

	const beginHoverCardSuppression = useCallback(() => {
		suppressionCountRef.current += 1;
		setSuppressionCount((count) => count + 1);
	}, []);
	const endHoverCardSuppression = useCallback(() => {
		suppressionCountRef.current = Math.max(0, suppressionCountRef.current - 1);
		setSuppressionCount((count) => Math.max(0, count - 1));
	}, []);

	const stateRef = useRef(state);
	const hoveredIdListenersRef = useRef(new Set<() => void>());
	useEffect(() => {
		const hoveredIdChanged = stateRef.current.hoveredId !== state.hoveredId;
		stateRef.current = state;
		if (hoveredIdChanged) {
			for (const listener of [...hoveredIdListenersRef.current]) {
				listener();
			}
		}
	}, [state]);
	const subscribeHoveredId = useCallback((listener: () => void) => {
		hoveredIdListenersRef.current.add(listener);
		return () => {
			hoveredIdListenersRef.current.delete(listener);
		};
	}, []);
	const getHoveredId = useCallback(() => stateRef.current.hoveredId, []);

	const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const cardElementRef = useRef<HTMLElement | null>(null);
	const triangleCleanupRef = useRef<(() => void) | null>(null);
	const activeTriangleRef = useRef<{
		apex: Point;
		forId: string;
	} | null>(null);
	const suppressedOpenRef = useRef<{
		id: string;
		anchor: HTMLElement;
		payload: DashboardSidebarHoverPayload;
		timer: ReturnType<typeof setTimeout>;
	} | null>(null);

	const clearOpenTimer = useCallback(() => {
		if (openTimerRef.current) {
			clearTimeout(openTimerRef.current);
			openTimerRef.current = null;
		}
	}, []);
	const clearCloseTimer = useCallback(() => {
		if (closeTimerRef.current) {
			clearTimeout(closeTimerRef.current);
			closeTimerRef.current = null;
		}
	}, []);
	const stopSafeTriangleTracking = useCallback(() => {
		triangleCleanupRef.current?.();
		triangleCleanupRef.current = null;
		activeTriangleRef.current = null;
	}, []);
	const cancelSuppressedOpen = useCallback(() => {
		if (suppressedOpenRef.current) {
			clearTimeout(suppressedOpenRef.current.timer);
			suppressedOpenRef.current = null;
		}
	}, []);

	const setCardElement = useCallback((element: HTMLElement | null) => {
		cardElementRef.current = element;
	}, []);

	const scheduleClose = useCallback(() => {
		clearCloseTimer();
		closeTimerRef.current = setTimeout(() => {
			setState({ hoveredId: null, anchorElement: null, payload: null });
			closeTimerRef.current = null;
		}, CLOSE_DELAY_MS);
	}, [clearCloseTimer]);

	const performOpen = useCallback(
		(
			id: string,
			anchor: HTMLElement,
			payload: DashboardSidebarHoverPayload,
		) => {
			// While suppressed (chip popover up, sidebar drag in progress) the
			// hover machine is inert: opening would set hoveredId, and hover-open
			// side effects (PR refresh) key off that state even when the card
			// itself is hidden.
			if (suppressionCountRef.current > 0) return;
			clearCloseTimer();
			stopSafeTriangleTracking();
			if (stateRef.current.hoveredId !== null) {
				clearOpenTimer();
				setState({ hoveredId: id, anchorElement: anchor, payload });
				return;
			}
			clearOpenTimer();
			openTimerRef.current = setTimeout(() => {
				openTimerRef.current = null;
				// Re-check at fire time: suppression may have begun (chip popover,
				// drag start) while this open was waiting out OPEN_DELAY_MS.
				if (suppressionCountRef.current > 0) return;
				setState({ hoveredId: id, anchorElement: anchor, payload });
			}, OPEN_DELAY_MS);
		},
		[clearCloseTimer, clearOpenTimer, stopSafeTriangleTracking],
	);

	// Called when a safe triangle is abandoned — the pointer strayed outside
	// the cone, or the tracking deadline elapsed. If a sibling row grazed
	// along the way is still waiting out its dwell timer, promote it directly
	// instead of closing and letting the dwell timer race a cold re-open:
	// `performOpen` sees `hoveredId` still set here and switches instantly,
	// with no gap and no re-applied OPEN_DELAY_MS.
	const abandonCone = useCallback(() => {
		stopSafeTriangleTracking();
		const pending = suppressedOpenRef.current;
		if (pending) {
			suppressedOpenRef.current = null;
			clearTimeout(pending.timer);
			performOpen(pending.id, pending.anchor, pending.payload);
			return;
		}
		scheduleClose();
	}, [performOpen, scheduleClose, stopSafeTriangleTracking]);

	const requestOpen = useCallback<HoverContextValue["requestOpen"]>(
		(id, anchor, payload, enterPoint) => {
			if (suppressedOpenRef.current && suppressedOpenRef.current.id !== id) {
				cancelSuppressedOpen();
			}

			const activeTriangle = activeTriangleRef.current;
			if (
				activeTriangle &&
				activeTriangle.forId !== id &&
				enterPoint &&
				isPointInsideCardCone(
					enterPoint,
					activeTriangle.apex,
					cardElementRef.current,
				)
			) {
				// Pointer is cutting through this row on a path aimed at the
				// still-open card — don't switch hover yet, but don't drop the
				// request either: if the pointer settles here instead of
				// reaching the card, open it after a short dwell.
				if (!suppressedOpenRef.current) {
					const timer = setTimeout(() => {
						suppressedOpenRef.current = null;
						performOpen(id, anchor, payload);
					}, SUPPRESSED_OPEN_DWELL_MS);
					suppressedOpenRef.current = { id, anchor, payload, timer };
				}
				return;
			}

			cancelSuppressedOpen();
			performOpen(id, anchor, payload);
		},
		[cancelSuppressedOpen, performOpen],
	);

	const requestClose = useCallback<HoverContextValue["requestClose"]>(
		(id, leavePoint) => {
			if (suppressedOpenRef.current?.id === id) {
				// Left before the dwell fired — this row was just being cut
				// through, not settled on.
				cancelSuppressedOpen();
			}
			if (openTimerRef.current && stateRef.current.hoveredId === null) {
				// Pending open for this id — cancel it.
				clearOpenTimer();
				return;
			}
			if (stateRef.current.hoveredId !== id) return;

			if (!leavePoint || !cardElementRef.current) {
				scheduleClose();
				return;
			}

			// Safe triangle: apex at the point the pointer left the trigger, base
			// at the card's near edge. Keep the card open while the pointer stays
			// inside it — that's a path aimed at the card, not away from it. The
			// base is re-derived from the card's live rect on each check (see
			// isPointInsideCardCone), not captured once here.
			stopSafeTriangleTracking();
			activeTriangleRef.current = { apex: leavePoint, forId: id };
			const handlePointerMove = (event: MouseEvent) => {
				const point = { x: event.clientX, y: event.clientY };
				if (isPointInsideCardCone(point, leavePoint, cardElementRef.current)) {
					return;
				}
				abandonCone();
			};
			document.addEventListener("mousemove", handlePointerMove);
			// Backstop: if the pointer stops moving entirely (or events just don't
			// arrive) while still "inside" the cone, don't stay open forever.
			const deadlineTimer = setTimeout(abandonCone, SAFE_TRIANGLE_MAX_TRACK_MS);
			triangleCleanupRef.current = () => {
				document.removeEventListener("mousemove", handlePointerMove);
				clearTimeout(deadlineTimer);
			};
		},
		[
			abandonCone,
			cancelSuppressedOpen,
			clearOpenTimer,
			scheduleClose,
			stopSafeTriangleTracking,
		],
	);

	const cancelClose = useCallback(() => {
		clearCloseTimer();
		stopSafeTriangleTracking();
		// Pointer reached the real target card — any row it grazed on the way
		// was just being cut through, not settled on.
		cancelSuppressedOpen();
	}, [cancelSuppressedOpen, clearCloseTimer, stopSafeTriangleTracking]);

	const forceClose = useCallback(() => {
		clearOpenTimer();
		clearCloseTimer();
		stopSafeTriangleTracking();
		cancelSuppressedOpen();
		setState({ hoveredId: null, anchorElement: null, payload: null });
	}, [
		cancelSuppressedOpen,
		clearCloseTimer,
		clearOpenTimer,
		stopSafeTriangleTracking,
	]);

	const syncIfHovered = useCallback<HoverContextValue["syncIfHovered"]>(
		(id, payload) => {
			setState((prev) => {
				if (prev.hoveredId !== id) return prev;
				if (
					prev.payload?.workspace === payload.workspace &&
					prev.payload.onEditBranchClick === payload.onEditBranchClick
				) {
					return prev;
				}
				return { ...prev, payload };
			});
		},
		[],
	);

	useEffect(
		() => () => {
			clearOpenTimer();
			clearCloseTimer();
			stopSafeTriangleTracking();
			cancelSuppressedOpen();
		},
		[
			cancelSuppressedOpen,
			clearCloseTimer,
			clearOpenTimer,
			stopSafeTriangleTracking,
		],
	);

	const value = useMemo<HoverContextValue>(
		() => ({
			hoveredId: state.hoveredId,
			anchorElement: state.anchorElement,
			payload: state.payload,
			contextMenuOpen,
			hoverCardSuppressed: suppressionCount > 0,
			requestOpen,
			requestClose,
			cancelClose,
			forceClose,
			setContextMenuOpen,
			beginHoverCardSuppression,
			endHoverCardSuppression,
			syncIfHovered,
			setCardElement,
		}),
		[
			state.hoveredId,
			state.anchorElement,
			state.payload,
			contextMenuOpen,
			suppressionCount,
			requestOpen,
			requestClose,
			cancelClose,
			forceClose,
			beginHoverCardSuppression,
			endHoverCardSuppression,
			syncIfHovered,
			setCardElement,
		],
	);

	// Every entry is identity-stable, so this memo never invalidates and
	// consumers of the actions context never re-render from hover churn.
	const actionsValue = useMemo<HoverActionsContextValue>(
		() => ({
			requestOpen,
			requestClose,
			cancelClose,
			forceClose,
			setContextMenuOpen,
			beginHoverCardSuppression,
			endHoverCardSuppression,
			syncIfHovered,
			setCardElement,
			subscribeHoveredId,
			getHoveredId,
		}),
		[
			requestOpen,
			requestClose,
			cancelClose,
			forceClose,
			beginHoverCardSuppression,
			endHoverCardSuppression,
			syncIfHovered,
			setCardElement,
			subscribeHoveredId,
			getHoveredId,
		],
	);

	return (
		<HoverActionsContext.Provider value={actionsValue}>
			<HoverContext.Provider value={value}>{children}</HoverContext.Provider>
		</HoverActionsContext.Provider>
	);
}

export function useDashboardSidebarHover() {
	const ctx = useContext(HoverContext);
	if (!ctx) {
		throw new Error(
			"useDashboardSidebarHover must be used inside DashboardSidebarHoverProvider",
		);
	}
	return ctx;
}

export function useDashboardSidebarHoverActions() {
	const ctx = useContext(HoverActionsContext);
	if (!ctx) {
		throw new Error(
			"useDashboardSidebarHoverActions must be used inside DashboardSidebarHoverProvider",
		);
	}
	return ctx;
}

/**
 * Whether `id` is the committed hovered row. Subscription-based so a hover
 * commit re-renders only the two affected rows, not every context consumer.
 */
export function useDashboardSidebarIsHovered(id: string): boolean {
	const { subscribeHoveredId, getHoveredId } =
		useDashboardSidebarHoverActions();
	return useSyncExternalStore(
		subscribeHoveredId,
		useCallback(() => getHoveredId() === id, [getHoveredId, id]),
	);
}
