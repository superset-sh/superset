import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";

export interface HistorySuggestion {
	url: string;
	title: string;
	faviconUrl: string | null;
	lastVisitedAt: number;
	visitCount: number;
}

interface UseUrlAutocompleteOptions {
	onSelect: (url: string) => void;
}

export function useUrlAutocomplete({ onSelect }: UseUrlAutocompleteOptions) {
	const [isOpen, setIsOpen] = useState(false);
	const [highlightedIndex, setHighlightedIndex] = useState(-1);
	const [query, setQuery] = useState("");
	const [allHistory, setAllHistory] = useState<HistorySuggestion[]>([]);
	const suggestionsRef = useRef<HistorySuggestion[]>([]);

	useEffect(() => {
		if (!isOpen) return;
		let cancelled = false;
		electronTrpcClient.browserHistory.getAll
			.query()
			.then((items) => {
				if (!cancelled) setAllHistory(items as HistorySuggestion[]);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [isOpen]);

	const suggestions = useMemo(() => {
		if (!query.trim()) {
			return allHistory.slice(0, 15);
		}
		const lower = query.toLowerCase();
		return allHistory
			.filter(
				(item) =>
					item.url.toLowerCase().includes(lower) ||
					item.title.toLowerCase().includes(lower),
			)
			.slice(0, 8);
	}, [allHistory, query]);

	suggestionsRef.current = suggestions;

	const open = useCallback(() => {
		setIsOpen(true);
		setHighlightedIndex(-1);
	}, []);

	const close = useCallback(() => {
		setIsOpen(false);
		setHighlightedIndex(-1);
	}, []);

	const updateQuery = useCallback((value: string) => {
		setQuery(value);
		setHighlightedIndex(-1);
	}, []);

	const selectSuggestion = useCallback(
		(url: string) => {
			onSelect(url);
			close();
		},
		[onSelect, close],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent): boolean => {
			if (!isOpen || suggestions.length === 0) return false;

			switch (e.key) {
				case "ArrowDown": {
					e.preventDefault();
					setHighlightedIndex((prev) =>
						prev < suggestions.length - 1 ? prev + 1 : 0,
					);
					return true;
				}
				case "ArrowUp": {
					e.preventDefault();
					setHighlightedIndex((prev) =>
						prev > 0 ? prev - 1 : suggestions.length - 1,
					);
					return true;
				}
				case "Enter": {
					if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
						e.preventDefault();
						selectSuggestion(suggestions[highlightedIndex].url);
						return true;
					}
					return false;
				}
				case "Escape": {
					if (isOpen) {
						e.preventDefault();
						e.stopPropagation();
						close();
						return true;
					}
					return false;
				}
				default:
					return false;
			}
		},
		[isOpen, suggestions, highlightedIndex, selectSuggestion, close],
	);

	return {
		isOpen,
		suggestions,
		highlightedIndex,
		open,
		close,
		updateQuery,
		selectSuggestion,
		handleKeyDown,
	};
}
