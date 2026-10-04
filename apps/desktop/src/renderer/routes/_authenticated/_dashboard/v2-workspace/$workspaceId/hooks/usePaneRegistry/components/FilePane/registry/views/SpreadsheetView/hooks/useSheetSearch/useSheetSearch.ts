import type { NumberSeparators } from "@superset/i18n/format";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CellPosition, SearchResult } from "../../types";
import type { SheetWorkerClient } from "../../utils/sheetWorker";

const MATCH_LIMIT = 10_000;
const QUERY_DELAY_MS = 120;

interface UseSheetSearchOptions {
	client: SheetWorkerClient;
	sheetIndex: number;
	colCount: number;
	numbers: NumberSeparators;
	onReveal: (cell: CellPosition) => void;
	delayMs?: number;
}

export type SearchStatus = "idle" | "pending" | "error" | "done";

/** Matches belong to the search that produced them, and die with it. */
interface Answer {
	key: string;
	result: SearchResult;
	activeIndex: number;
}

export function useSheetSearch({
	client,
	sheetIndex,
	colCount,
	numbers,
	onReveal,
	delayMs = QUERY_DELAY_MS,
}: UseSheetSearchOptions) {
	const [isOpen, setIsOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [caseSensitive, setCaseSensitive] = useState(false);
	const [answer, setAnswer] = useState<Answer | null>(null);
	const [failedKey, setFailedKey] = useState<string | null>(null);
	const { group, decimal } = numbers;
	const key = JSON.stringify([
		sheetIndex,
		query,
		caseSensitive,
		group,
		decimal,
	]);
	const current = isOpen && query && answer?.key === key ? answer : null;
	const status: SearchStatus =
		!isOpen || !query
			? "idle"
			: current
				? "done"
				: failedKey === key
					? "error"
					: "pending";

	useEffect(() => {
		if (!isOpen || !query) return;
		let cancelled = false;
		const timer = setTimeout(() => {
			client
				.request({
					type: "search",
					sheet: sheetIndex,
					query,
					caseSensitive,
					limit: MATCH_LIMIT,
					numbers: { group, decimal },
				})
				.then(
					(result) => {
						if (cancelled) return;
						setAnswer({ key, result, activeIndex: 0 });
						const [row, col] = result.matches;
						if (row !== undefined && col !== undefined) onReveal({ row, col });
					},
					(error: unknown) => {
						if (cancelled) return;
						console.error("[SpreadsheetView] search failed", error);
						setFailedKey(key);
					},
				);
		}, delayMs);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [
		client,
		key,
		sheetIndex,
		query,
		caseSensitive,
		group,
		decimal,
		isOpen,
		onReveal,
		delayMs,
	]);

	const result = current?.result ?? null;
	const activeIndex = current?.activeIndex ?? 0;
	const matchCount = result ? result.matches.length / 2 : 0;

	const matchKeys = useMemo(() => {
		if (!result || result.matches.length === 0) return null;
		const keys = new Set<number>();
		for (let i = 0; i < result.matches.length; i += 2) {
			keys.add(
				(result.matches[i] ?? 0) * colCount + (result.matches[i + 1] ?? 0),
			);
		}
		return keys;
	}, [result, colCount]);

	const matchAt = useCallback(
		(index: number): CellPosition | null => {
			const row = result?.matches[index * 2];
			const col = result?.matches[index * 2 + 1];
			return row === undefined || col === undefined ? null : { row, col };
		},
		[result],
	);

	const step = (delta: 1 | -1) => {
		if (!current || matchCount === 0) return;
		const next = (activeIndex + delta + matchCount) % matchCount;
		setAnswer({ ...current, activeIndex: next });
		const cell = matchAt(next);
		if (cell) onReveal(cell);
	};

	return {
		isOpen,
		status,
		open: () => setIsOpen(true),
		close: () => setIsOpen(false),
		query,
		setQuery,
		caseSensitive,
		setCaseSensitive,
		matchCount,
		truncated: result?.truncated ?? false,
		activeIndex,
		activeMatch: matchAt(activeIndex),
		matchKeys,
		findNext: () => step(1),
		findPrevious: () => step(-1),
	};
}
