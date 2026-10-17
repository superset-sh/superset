import { useLingui } from "@lingui/react/macro";
import { hasOmittedBody, type SessionSnapshot } from "@superset/chat/core";
import type { ToolCall } from "@superset/chat/protocol";
import type { useMessageScroller } from "@superset/chat-ui/MessageScroller";
import {
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { useHotkey } from "renderer/hotkeys";
import { toolTitleText } from "../../utils/toolTitle";
import {
	type FindMatch,
	findMatches,
	findNeedle,
	findSegments,
	sameMatch,
} from "../../utils/transcriptFind";
import {
	clearHighlights,
	collectHighlights,
	paintHighlights,
} from "../../utils/transcriptHighlights";
import { rowMessageId, type TranscriptRow } from "../../utils/transcriptRows";

import { useThrottledValue } from "./hooks/useThrottledValue";

const DEBOUNCE_MS = 150;
const NO_PLUGINS: ReadonlySet<string> = new Set();
/** Rows near the viewport finish laying out over a frame or two after a jump. */
const REVEAL_FRAMES = 3;
/** Keeps a revealed hit clear of the find bar and the pane edges. */
const REVEAL_MARGIN_PX = 48;
/** Surfaces with their own ⌘F, which keep it while focus is inside them. */
const FOREIGN_FIND_SCOPES = '[role="dialog"], [role="alertdialog"]';

type ScrollToMessage = ReturnType<typeof useMessageScroller>["scrollToMessage"];

type Current = { match: FindMatch; index: number };
type Reveal = { match: FindMatch; messageId: string; frames: number };

export type UseTranscriptFindOptions = {
	rows: readonly TranscriptRow[];
	snapshot: SessionSnapshot;
	onRequestItemBodies: (itemIds: readonly string[]) => void;
	installedPluginNames?: ReadonlySet<string>;
	viewport: HTMLElement | null;
	isActive: boolean;
	isEntryCollapsed: (entryKey: string, defaultCollapsed: boolean) => boolean;
	onToggleEntry: (entryKey: string, collapsed: boolean) => void;
	scrollToMessage: ScrollToMessage;
	/** Called when the reader closes the bar, so focus can go back to the composer. */
	onClose?: (() => void) | undefined;
	debounceMs?: number;
};

export type TranscriptFind = {
	isOpen: boolean;
	loading: boolean;
	open: () => void;
	close: () => void;
	query: string;
	setQuery: (query: string) => void;
	matchCount: number;
	/** The current match's position from 0; -1 while there is none. */
	currentIndex: number;
	/** The row of the current match, which the transcript renders even off screen. */
	currentRowKey: string | null;
	next: () => void;
	previous: () => void;
	inputRef: RefObject<HTMLInputElement | null>;
};

function insideForeignFindScope(event: KeyboardEvent): boolean {
	return (
		event.target instanceof Element &&
		event.target.closest(FOREIGN_FIND_SCOPES) !== null
	);
}

function rowElement(viewport: HTMLElement, messageId: string): Element | null {
	if (typeof CSS === "undefined" || typeof CSS.escape !== "function")
		return null;
	return viewport.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
}

function revealRect(viewport: HTMLElement, rect: DOMRect, center: boolean) {
	const bounds = viewport.getBoundingClientRect();
	const top = bounds.top + REVEAL_MARGIN_PX;
	const bottom = bounds.bottom - REVEAL_MARGIN_PX;
	if (rect.top >= top && rect.bottom <= bottom) return;
	const offset = center
		? Math.max(REVEAL_MARGIN_PX, (bounds.height - rect.height) / 2)
		: REVEAL_MARGIN_PX;
	viewport.scrollTop += rect.top - bounds.top - offset;
}

export function useTranscriptFind({
	rows,
	snapshot,
	onRequestItemBodies,
	installedPluginNames = NO_PLUGINS,
	viewport,
	isActive,
	isEntryCollapsed,
	onToggleEntry,
	scrollToMessage,
	onClose,
	debounceMs = DEBOUNCE_MS,
}: UseTranscriptFindOptions): TranscriptFind {
	const { t } = useLingui();
	const [isOpen, setIsOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [current, setCurrent] = useState<Current | null>(null);
	const [jumps, setJumps] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);

	const omittedItemIds = useMemo(
		() =>
			[...snapshot.items.values()]
				.filter(({ item }) => hasOmittedBody(item))
				.map(({ item }) => item.id),
		[snapshot.items],
	);
	useEffect(() => {
		if (isOpen && omittedItemIds.length > 0) {
			onRequestItemBodies(omittedItemIds);
		}
	}, [isOpen, omittedItemIds, onRequestItemBodies]);

	const source = useMemo(() => ({ rows, snapshot }), [rows, snapshot]);
	const indexed = useThrottledValue(source, debounceMs);
	const formatToolTitle = useCallback(
		(item: ToolCall) =>
			toolTitleText(
				item,
				t,
				item.mcpServer !== undefined &&
					installedPluginNames.has(item.mcpServer.name),
			),
		[t, installedPluginNames],
	);
	const segments = useMemo(
		() =>
			isOpen
				? findSegments(
						indexed.rows,
						indexed.snapshot,
						indexed.snapshot.session?.harness,
						formatToolTitle,
					)
				: [],
		[isOpen, indexed, formatToolTitle],
	);
	const settledNeedle = useDebouncedValue(findNeedle(query), debounceMs);
	const needle = isOpen ? settledNeedle : "";
	const matches = useMemo(
		() => findMatches(segments, needle),
		[segments, needle],
	);

	const currentIndex = useMemo(() => {
		if (!current || matches.length === 0) return -1;
		const exact = matches.findIndex((match) => sameMatch(match, current.match));
		return exact === -1 ? Math.min(current.index, matches.length - 1) : exact;
	}, [current, matches]);
	const currentMatch = matches[currentIndex] ?? null;

	const rowsByKey = useMemo(
		() => new Map(rows.map((row) => [row.key, row])),
		[rows],
	);
	const rowsByKeyRef = useRef(rowsByKey);
	rowsByKeyRef.current = rowsByKey;
	const matchesRef = useRef(matches);
	matchesRef.current = matches;
	const currentRef = useRef(current);
	currentRef.current = current;
	const currentIndexRef = useRef(currentIndex);
	currentIndexRef.current = currentIndex;
	const revealRef = useRef<Reveal | null>(null);

	const goTo = useCallback(
		(index: number) => {
			const match = matchesRef.current[index];
			if (!match) return;
			const row = rowsByKeyRef.current.get(match.rowKey);
			if (
				row?.kind === "tool_run" &&
				isEntryCollapsed(row.key, row.defaultCollapsed)
			) {
				onToggleEntry(row.key, false);
			}
			revealRef.current = row
				? { match, messageId: rowMessageId(row), frames: REVEAL_FRAMES }
				: null;
			setCurrent({ match, index });
			setJumps((count) => count + 1);
		},
		[isEntryCollapsed, onToggleEntry],
	);
	const goToRef = useRef(goTo);
	goToRef.current = goTo;

	const next = useCallback(() => {
		const total = matchesRef.current.length;
		if (total === 0) return;
		goTo((currentIndexRef.current + 1) % total);
	}, [goTo]);
	const previous = useCallback(() => {
		const total = matchesRef.current.length;
		if (total === 0) return;
		const index = currentIndexRef.current;
		goTo(index <= 0 ? total - 1 : index - 1);
	}, [goTo]);

	const open = useCallback(() => setIsOpen(true), []);
	const dismiss = useCallback(() => {
		setIsOpen(false);
		setCurrent(null);
		revealRef.current = null;
	}, []);
	const close = useCallback(() => {
		dismiss();
		onClose?.();
	}, [dismiss, onClose]);

	useHotkey(
		"FIND_IN_CHAT",
		() => {
			if (!isOpen) {
				setIsOpen(true);
				return;
			}
			inputRef.current?.focus();
			inputRef.current?.select();
		},
		{
			enabled: isActive,
			preventDefault: true,
			ignoreEventWhen: insideForeignFindScope,
		},
	);

	// Focus already belongs to the pane the reader moved to, so this close
	// must not hand it back to this pane's composer.
	useEffect(() => {
		if (!isActive && isOpen) dismiss();
	}, [isActive, isOpen, dismiss]);

	useEffect(() => {
		if (!isOpen || !isActive) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "F3" || event.isComposing) return;
			event.preventDefault();
			if (event.shiftKey) previous();
			else next();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [isOpen, isActive, next, previous]);

	// Land on the first hit once a query settles, or once hits appear for a
	// query that had none. Later changes to the list never move the reader.
	const jumpedForRef = useRef<string | null>(null);
	useEffect(() => {
		if (!isOpen || !needle) {
			jumpedForRef.current = null;
			if (!needle) setCurrent(null);
			return;
		}
		if (jumpedForRef.current === needle && currentRef.current !== null) return;
		if (matches.length === 0) return;
		jumpedForRef.current = needle;
		goToRef.current(0);
	}, [isOpen, needle, matches]);

	useEffect(() => {
		if (!isOpen || jumps === 0) return;
		const reveal = revealRef.current;
		if (!reveal) return;
		scrollToMessage(reveal.messageId, {
			align: "start",
			scrollMargin: REVEAL_MARGIN_PX,
		});
	}, [isOpen, jumps, scrollToMessage]);

	// Repainted for every jump, even back onto the same hit, so a reveal that
	// was interrupted still finishes.
	useEffect(() => {
		if (!isOpen || !viewport || !needle) {
			clearHighlights();
			return;
		}
		let frame = 0;
		const schedule = () => {
			if (frame === 0) frame = requestAnimationFrame(paint);
		};
		const paint = () => {
			frame = 0;
			const plan = collectHighlights(viewport, needle, currentMatch);
			paintHighlights(plan);
			const reveal = revealRef.current;
			if (
				jumps === 0 ||
				!reveal ||
				!currentMatch ||
				!sameMatch(reveal.match, currentMatch)
			)
				return;
			const hit = plan.current?.getBoundingClientRect();
			if (hit && hit.height > 0) {
				revealRect(viewport, hit, true);
			} else {
				const row = rowElement(viewport, reveal.messageId);
				if (row) revealRect(viewport, row.getBoundingClientRect(), false);
			}
			reveal.frames -= 1;
			if (reveal.frames <= 0) revealRef.current = null;
			else schedule();
		};
		const observer = new MutationObserver(schedule);
		observer.observe(viewport, {
			childList: true,
			characterData: true,
			subtree: true,
		});
		paint();
		return () => {
			observer.disconnect();
			if (frame !== 0) cancelAnimationFrame(frame);
			clearHighlights();
		};
	}, [isOpen, viewport, needle, currentMatch, jumps]);

	return {
		isOpen,
		loading: isOpen && omittedItemIds.length > 0,
		open,
		close,
		query,
		setQuery,
		matchCount: matches.length,
		currentIndex,
		currentRowKey: currentMatch?.rowKey ?? null,
		next,
		previous,
		inputRef,
	};
}
