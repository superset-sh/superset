import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ISearchOptions, SearchAddon } from "@xterm/addon-search";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiChevronDown, HiChevronUp, HiXMark } from "react-icons/hi2";
import { PiTextAa } from "react-icons/pi";

interface TerminalSearchProps {
	searchAddon: SearchAddon | null;
	isOpen: boolean;
	onClose: () => void;
}

const SEARCH_DECORATIONS: ISearchOptions["decorations"] = {
	matchBackground: "#515c6a",
	matchBorder: "#74879f",
	matchOverviewRuler: "#d186167e",
	activeMatchBackground: "#515c6a",
	activeMatchBorder: "#ffd33d",
	activeMatchColorOverviewRuler: "#ffd33d",
};

export function TerminalSearch({
	searchAddon,
	isOpen,
	onClose,
}: TerminalSearchProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	const [matchCount, setMatchCount] = useState<number | null>(null);
	const [caseSensitive, setCaseSensitive] = useState(false);

	const searchOptions: ISearchOptions = useMemo(
		() => ({
			caseSensitive,
			regex: false,
			decorations: SEARCH_DECORATIONS,
		}),
		[caseSensitive],
	);

	// Focus input when search opens
	useEffect(() => {
		if (isOpen && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isOpen]);

	// Clear search highlighting when closing
	useEffect(() => {
		if (!isOpen && searchAddon) {
			searchAddon.clearDecorations();
		}
	}, [isOpen, searchAddon]);

	const handleSearch = useCallback(
		(direction: "next" | "previous") => {
			if (!searchAddon || !query) return;

			const found =
				direction === "next"
					? searchAddon.findNext(query, searchOptions)
					: searchAddon.findPrevious(query, searchOptions);

			// xterm search addon doesn't provide match count directly
			// We just indicate if there are matches or not
			setMatchCount(found ? 1 : 0);
		},
		[searchAddon, query, searchOptions],
	);

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newQuery = e.target.value;
		setQuery(newQuery);

		if (searchAddon && newQuery) {
			const found = searchAddon.findNext(newQuery, searchOptions);
			setMatchCount(found ? 1 : 0);
		} else {
			setMatchCount(null);
			searchAddon?.clearDecorations();
		}
	};

	const toggleCaseSensitive = () => {
		setCaseSensitive((prev) => !prev);
	};

	// Re-run search when case sensitivity changes
	useEffect(() => {
		if (searchAddon && query) {
			const found = searchAddon.findNext(query, searchOptions);
			setMatchCount(found ? 1 : 0);
		}
	}, [caseSensitive, searchAddon, query, searchOptions]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			e.preventDefault();
			onClose();
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (e.shiftKey) {
				handleSearch("previous");
			} else {
				handleSearch("next");
			}
		}
	};

	const handleClose = () => {
		setQuery("");
		setMatchCount(null);
		onClose();
	};

	if (!isOpen) return null;

	return (
		<div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md border border-border bg-background/95 px-2 py-1 shadow-lg backdrop-blur-sm">
			<input
				ref={inputRef}
				type="text"
				value={query}
				onChange={handleInputChange}
				onKeyDown={handleKeyDown}
				placeholder="Find..."
				className="h-6 w-48 bg-transparent px-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
			/>
			{matchCount !== null && query && (
				<span className="text-xs text-muted-foreground">
					{matchCount === 0 ? "No matches" : ""}
				</span>
			)}
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={toggleCaseSensitive}
						className={`rounded p-1 ${
							caseSensitive
								? "bg-muted text-foreground"
								: "text-muted-foreground hover:bg-muted hover:text-foreground"
						}`}
					>
						<PiTextAa className="h-4 w-4" />
					</button>
				</TooltipTrigger>
				<TooltipContent>Match case</TooltipContent>
			</Tooltip>
			<button
				type="button"
				onClick={() => handleSearch("previous")}
				className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
				title="Previous match (Shift+Enter)"
			>
				<HiChevronUp className="h-4 w-4" />
			</button>
			<button
				type="button"
				onClick={() => handleSearch("next")}
				className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
				title="Next match (Enter)"
			>
				<HiChevronDown className="h-4 w-4" />
			</button>
			<button
				type="button"
				onClick={handleClose}
				className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
				title="Close (Escape)"
			>
				<HiXMark className="h-4 w-4" />
			</button>
		</div>
	);
}
