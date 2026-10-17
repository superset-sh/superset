import {
	startTransition,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { TranscriptRow } from "../../utils/transcriptRows";
import { rowHeightsFor } from "./utils/rowHeights";

const INITIAL_ROWS = 40;
const REVEAL_ROWS = 40;
const REVEAL_MARGIN_PX = 1200;
const ESTIMATED_ROW_HEIGHT_PX = 120;
const MAX_REVEAL_HOLD_MS = 1500;

type RowRef = (element: HTMLElement | null) => void;

export type TranscriptWindow = {
	startIndex: number;
	spacerHeight: number;
	spacerRef: (element: HTMLDivElement | null) => void;
	rowRef: (rowKey: string) => RowRef;
	resetToTail: () => void;
	holdRevealUntilScrollEnds: () => void;
};

function spacerHeightFor(
	rows: readonly TranscriptRow[],
	startIndex: number,
	heights: ReadonlyMap<string, number>,
): number {
	let total = 0;
	for (let index = 0; index < startIndex; index++) {
		const key = rows[index]?.key;
		total += (key && heights.get(key)) || ESTIMATED_ROW_HEIGHT_PX;
	}
	return total;
}

export function useTranscriptWindow({
	rows,
	viewport,
	sessionId,
	pinnedRowKeys,
	observeRow,
}: {
	rows: readonly TranscriptRow[];
	viewport: HTMLElement | null;
	sessionId: string;
	pinnedRowKeys: readonly (string | null)[];
	observeRow: (rowKey: string) => RowRef;
}): TranscriptWindow {
	const heights = useMemo(() => rowHeightsFor(sessionId), [sessionId]);
	const [windowState, setWindowState] = useState<{
		sessionId: string;
		firstKey: string | null;
		startIndex: number | null;
	}>({ sessionId, firstKey: null, startIndex: null });

	const tailStart = Math.max(0, rows.length - INITIAL_ROWS);
	const sameSession = windowState.sessionId === sessionId;
	const firstKey = sameSession ? windowState.firstKey : null;
	const lastStart = sameSession ? windowState.startIndex : null;
	const firstIndex =
		firstKey === null ? -1 : rows.findIndex((row) => row.key === firstKey);
	let startIndex =
		firstIndex !== -1
			? firstIndex
			: lastStart === null
				? tailStart
				: Math.min(lastStart, tailStart);
	for (const key of pinnedRowKeys) {
		if (key === null) continue;
		const index = rows.findIndex((row) => row.key === key);
		if (index !== -1 && index < startIndex) startIndex = index;
	}
	const startKey = rows[startIndex]?.key ?? null;
	if (
		startKey !== null &&
		(!sameSession ||
			windowState.firstKey !== startKey ||
			windowState.startIndex !== startIndex)
	) {
		setWindowState({ sessionId, firstKey: startKey, startIndex });
	}

	const rowsRef = useRef(rows);
	rowsRef.current = rows;
	const startIndexRef = useRef(startIndex);
	startIndexRef.current = startIndex;
	const revealHeldRef = useRef(false);
	const revealObserverRef = useRef<{
		observer: IntersectionObserver;
		spacer: HTMLDivElement;
	} | null>(null);
	const revealOlder = useCallback(() => {
		if (revealHeldRef.current) return;
		const nextIndex = Math.max(0, startIndexRef.current - REVEAL_ROWS);
		const nextKey = rowsRef.current[nextIndex]?.key;
		if (!nextKey) return;
		startTransition(() => {
			setWindowState((previous) =>
				previous.startIndex !== null && previous.startIndex <= nextIndex
					? previous
					: { ...previous, firstKey: nextKey, startIndex: nextIndex },
			);
		});
	}, []);

	const resetToTail = useCallback(() => {
		startTransition(() => {
			setWindowState((previous) => ({
				...previous,
				firstKey: null,
				startIndex: null,
			}));
		});
	}, []);

	const holdRevealUntilScrollEnds = useCallback(() => {
		if (!viewport) return;
		revealHeldRef.current = true;
		const release = () => {
			window.clearTimeout(timer);
			viewport.removeEventListener("scrollend", release);
			revealHeldRef.current = false;
			const watched = revealObserverRef.current;
			watched?.observer.unobserve(watched.spacer);
			watched?.observer.observe(watched.spacer);
		};
		const timer = window.setTimeout(release, MAX_REVEAL_HOLD_MS);
		viewport.addEventListener("scrollend", release);
	}, [viewport]);

	const [spacer, setSpacer] = useState<HTMLDivElement | null>(null);
	useEffect(() => {
		if (!viewport || !spacer || startIndex === 0) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) revealOlder();
			},
			{ root: viewport, rootMargin: `${REVEAL_MARGIN_PX}px 0px 0px 0px` },
		);
		observer.observe(spacer);
		revealObserverRef.current = { observer, spacer };
		return () => {
			observer.disconnect();
			revealObserverRef.current = null;
		};
	}, [viewport, spacer, startIndex, revealOlder]);

	const elements = useRef(new Map<string, HTMLElement>());
	const resizeObserverRef = useRef<ResizeObserver | null>(null);
	useEffect(() => {
		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const key = (entry.target as HTMLElement).dataset.windowRowKey;
				const height =
					entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height;
				if (key && height > 0) heights.set(key, height);
			}
		});
		resizeObserverRef.current = observer;
		for (const element of elements.current.values()) observer.observe(element);
		return () => {
			observer.disconnect();
			resizeObserverRef.current = null;
		};
	}, [heights]);

	const rowRefs = useRef(new Map<string, RowRef>());
	const rowRef = useCallback(
		(rowKey: string) => {
			const cached = rowRefs.current.get(rowKey);
			if (cached) return cached;
			const near = observeRow(rowKey);
			const ref: RowRef = (element) => {
				near(element);
				const previous = elements.current.get(rowKey);
				if (previous === element) return;
				if (previous) resizeObserverRef.current?.unobserve(previous);
				if (!element) {
					elements.current.delete(rowKey);
					rowRefs.current.delete(rowKey);
					return;
				}
				element.dataset.windowRowKey = rowKey;
				elements.current.set(rowKey, element);
				resizeObserverRef.current?.observe(element);
			};
			rowRefs.current.set(rowKey, ref);
			return ref;
		},
		[observeRow],
	);

	return {
		startIndex,
		spacerHeight: spacerHeightFor(rows, startIndex, heights),
		spacerRef: setSpacer,
		rowRef,
		resetToTail,
		holdRevealUntilScrollEnds,
	};
}
