"use client";

import { useCallback, useEffect, useRef } from "react";

// Cap how long we'll tolerate the pointer drifting inside the safe triangle
// before giving up and closing anyway, in case it stalls mid-gap.
const SAFE_TRIANGLE_MAX_TRACK_MS = 1000;
// How long a row suppressed by another row's safe triangle waits before
// opening anyway. Covers the case where the pointer settles on this row
// instead of continuing on to the original card — without this, a
// suppressed open that never gets re-requested (pointerenter only fires
// once) would just never open.
const SUPPRESSED_OPEN_DWELL_MS = 150;
// Rows are only ~10px tall and the card sits flush against the rail, so the
// cone from any leave point is extremely wide — nearly every vertical scrub
// with a little rightward drift would land inside it and feel laggy. Only
// arm the triangle when the pointer exits the open row actually moving
// toward the card (Floating UI's safePolygon "requireIntent"): horizontal
// exit speed past this threshold. Scrubs are dominantly vertical and stay
// instant; dashes at the card arm suppression.
const ARM_MIN_EXIT_SPEED_PX_PER_MS = 0.1;
const POINTER_SAMPLE_MIN_INTERVAL_MS = 30;
const POINTER_SAMPLE_MAX_AGE_MS = 120;

export interface Point {
	x: number;
	y: number;
}

interface PointerSample {
	point: Point;
	time: number;
}

// The leave event's own coordinates are ~the newest sample, so measuring
// against it gives a near-zero dt; prefer the sample at least half an
// interval old, falling back to the one before it.
function exitSpeedTowardCard(
	leavePoint: Point,
	current: PointerSample | null,
	previous: PointerSample | null,
): number {
	const now = performance.now();
	const sample =
		current && now - current.time >= POINTER_SAMPLE_MIN_INTERVAL_MS / 2
			? current
			: (previous ?? current);
	if (!sample) return 0;
	const elapsed = now - sample.time;
	if (elapsed <= 0 || elapsed > POINTER_SAMPLE_MAX_AGE_MS) return 0;
	return (leavePoint.x - sample.point.x) / elapsed;
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

// The card always renders flush against the rail's right edge, so the
// triangle's base is the card's left edge — no collision flipping to read
// off the element, unlike the dashboard sidebar's Radix popover. The base
// is re-derived from the card's *current* rect on every call rather than a
// rect captured once when tracking started — the card's bounds keep
// changing after that (its entrance transition, and its height depends on
// which row's content it shows).
function isPointInsideCardCone(
	point: Point,
	apex: Point,
	cardElement: HTMLElement | null,
): boolean {
	if (!cardElement) return false;
	const cardRect = cardElement.getBoundingClientRect();
	return isPointInTriangle(
		point,
		apex,
		{ x: cardRect.left, y: cardRect.top },
		{ x: cardRect.left, y: cardRect.bottom },
	);
}

export interface UseSafeTriangleHoverOptions<Payload> {
	onOpen: (payload: Payload) => void;
	onClose: () => void;
}

export function useSafeTriangleHover<Payload>({
	onOpen,
	onClose,
}: UseSafeTriangleHoverOptions<Payload>) {
	const callbacksRef = useRef({ onOpen, onClose });
	useEffect(() => {
		callbacksRef.current = { onOpen, onClose };
	}, [onOpen, onClose]);

	const openIdRef = useRef<string | null>(null);
	const cardElementRef = useRef<HTMLElement | null>(null);
	const currentSampleRef = useRef<PointerSample | null>(null);
	const previousSampleRef = useRef<PointerSample | null>(null);
	const triangleCleanupRef = useRef<(() => void) | null>(null);
	const activeTriangleRef = useRef<{ apex: Point; forId: string } | null>(null);
	const suppressedOpenRef = useRef<{
		id: string;
		payload: Payload;
		timer: ReturnType<typeof setTimeout>;
	} | null>(null);

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

	const containerPointerMove = useCallback((point: Point) => {
		const now = performance.now();
		const current = currentSampleRef.current;
		if (current && now - current.time < POINTER_SAMPLE_MIN_INTERVAL_MS) return;
		previousSampleRef.current = current;
		currentSampleRef.current = { point, time: now };
	}, []);

	const performOpen = useCallback(
		(id: string, payload: Payload) => {
			stopSafeTriangleTracking();
			openIdRef.current = id;
			callbacksRef.current.onOpen(payload);
		},
		[stopSafeTriangleTracking],
	);

	const performClose = useCallback(() => {
		stopSafeTriangleTracking();
		cancelSuppressedOpen();
		openIdRef.current = null;
		callbacksRef.current.onClose();
	}, [cancelSuppressedOpen, stopSafeTriangleTracking]);

	// Called when a safe triangle is abandoned — the pointer strayed outside
	// the cone, or the tracking deadline elapsed. If a sibling row grazed
	// along the way is still waiting out its dwell timer, promote it directly
	// instead of closing and reopening.
	const abandonCone = useCallback(() => {
		stopSafeTriangleTracking();
		const pending = suppressedOpenRef.current;
		if (pending) {
			suppressedOpenRef.current = null;
			clearTimeout(pending.timer);
			performOpen(pending.id, pending.payload);
			return;
		}
		performClose();
	}, [performClose, performOpen, stopSafeTriangleTracking]);

	const rowPointerEnter = useCallback(
		(id: string, payload: Payload, enterPoint?: Point) => {
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
						performOpen(id, payload);
					}, SUPPRESSED_OPEN_DWELL_MS);
					suppressedOpenRef.current = { id, payload, timer };
				}
				return;
			}

			cancelSuppressedOpen();
			performOpen(id, payload);
		},
		[cancelSuppressedOpen, performOpen],
	);

	// Safe triangle: apex at the point the pointer left the open row, base at
	// the card's left edge. While the pointer stays inside it, that's a path
	// aimed at the card — hold off closing or switching rows.
	const rowPointerLeave = useCallback(
		(id: string, leavePoint: Point) => {
			if (openIdRef.current !== id) return;
			if (
				exitSpeedTowardCard(
					leavePoint,
					currentSampleRef.current,
					previousSampleRef.current,
				) < ARM_MIN_EXIT_SPEED_PX_PER_MS
			) {
				return;
			}
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
			// Backstop: if the pointer stops moving entirely (or events just
			// don't arrive) while still "inside" the cone, don't stay open
			// forever.
			const deadlineTimer = setTimeout(abandonCone, SAFE_TRIANGLE_MAX_TRACK_MS);
			triangleCleanupRef.current = () => {
				document.removeEventListener("mousemove", handlePointerMove);
				clearTimeout(deadlineTimer);
			};
		},
		[abandonCone, stopSafeTriangleTracking],
	);

	const cardPointerEnter = useCallback(() => {
		stopSafeTriangleTracking();
		// Pointer reached the real target card — any row it grazed on the way
		// was just being cut through, not settled on.
		cancelSuppressedOpen();
	}, [cancelSuppressedOpen, stopSafeTriangleTracking]);

	const containerPointerLeave = useCallback(() => {
		if (activeTriangleRef.current) return;
		performClose();
	}, [performClose]);

	useEffect(
		() => () => {
			stopSafeTriangleTracking();
			cancelSuppressedOpen();
		},
		[cancelSuppressedOpen, stopSafeTriangleTracking],
	);

	return {
		setCardElement,
		rowPointerEnter,
		rowPointerLeave,
		cardPointerEnter,
		containerPointerMove,
		containerPointerLeave,
		forceClose: performClose,
	};
}
