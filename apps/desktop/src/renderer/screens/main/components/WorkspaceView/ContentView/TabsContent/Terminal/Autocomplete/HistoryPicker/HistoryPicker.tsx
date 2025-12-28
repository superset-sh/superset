import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "renderer/lib/trpc";
import { useAutocompleteStore } from "../stores/autocomplete-store";

interface HistoryPickerProps {
	workspaceId: string;
	onSelect: (command: string) => void;
	onClose: () => void;
}

interface HistoryItem {
	command: string;
	timestamp: number;
	workspaceId: string | null;
	cwd: string | null;
}

/**
 * HistoryPicker - A polished command palette for searching command history.
 * Triggered by Ctrl+R.
 */
export function HistoryPicker({
	workspaceId,
	onSelect,
	onClose,
}: HistoryPickerProps) {
	const isOpen = useAutocompleteStore((s) => s.isHistoryPickerOpen);
	const [query, setQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	// Fetch history based on query
	const { data: historyResults, isLoading } =
		trpc.autocomplete.searchHistory.useQuery(
			{
				query,
				limit: 15,
				workspaceId,
			},
			{
				enabled: isOpen,
			},
		);

	// Also fetch recent commands when query is empty
	const { data: recentResults } = trpc.autocomplete.getRecent.useQuery(
		{
			limit: 15,
			workspaceId,
		},
		{
			enabled: isOpen && !query,
		},
	);

	const results: HistoryItem[] = query
		? (historyResults ?? [])
		: (recentResults ?? []);

	// Reset selection when results change
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset on results.length change
	useEffect(() => {
		setSelectedIndex(0);
	}, [results.length]);

	// Focus input when opened
	useEffect(() => {
		if (isOpen && inputRef.current) {
			inputRef.current.focus();
			setQuery("");
			setSelectedIndex(0);
		}
	}, [isOpen]);

	// Scroll selected item into view
	useEffect(() => {
		if (listRef.current) {
			const selectedElement = listRef.current.children[selectedIndex] as
				| HTMLElement
				| undefined;
			selectedElement?.scrollIntoView({ block: "nearest" });
		}
	}, [selectedIndex]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			switch (e.key) {
				case "ArrowDown":
					e.preventDefault();
					setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
					break;
				case "ArrowUp":
					e.preventDefault();
					setSelectedIndex((i) => Math.max(i - 1, 0));
					break;
				case "Enter":
					e.preventDefault();
					if (results[selectedIndex]) {
						onSelect(results[selectedIndex].command);
						onClose();
					}
					break;
				case "Escape":
					e.preventDefault();
					onClose();
					break;
				case "Tab":
					e.preventDefault();
					if (e.shiftKey) {
						setSelectedIndex((i) => Math.max(i - 1, 0));
					} else {
						setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
					}
					break;
			}
		},
		[results, selectedIndex, onSelect, onClose],
	);

	const handleItemClick = useCallback(
		(command: string) => {
			onSelect(command);
			onClose();
		},
		[onSelect, onClose],
	);

	// Highlight matching portions of the command
	const highlightMatch = (command: string, searchQuery: string) => {
		if (!searchQuery) return <span>{command}</span>;

		const lowerCommand = command.toLowerCase();
		const lowerQuery = searchQuery.toLowerCase();
		const index = lowerCommand.indexOf(lowerQuery);

		if (index === -1) return <span>{command}</span>;

		return (
			<>
				<span className="text-muted-foreground">{command.slice(0, index)}</span>
				<span className="text-foreground font-medium">
					{command.slice(index, index + searchQuery.length)}
				</span>
				<span className="text-muted-foreground">
					{command.slice(index + searchQuery.length)}
				</span>
			</>
		);
	};

	if (!isOpen) return null;

	return (
		<div className="absolute inset-x-4 bottom-4 z-50">
			<div className="overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
				{/* Search Input */}
				<div className="flex items-center border-b border-border px-4 py-3">
					<svg
						aria-hidden="true"
						className="mr-3 size-4 shrink-0 text-muted-foreground"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={1.5}
							d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
						/>
					</svg>
					<input
						ref={inputRef}
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Search command history..."
						className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
					/>
					<div className="ml-3 flex items-center gap-1.5 text-xs text-muted-foreground/60">
						<kbd className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[10px]">
							↑↓
						</kbd>
						<span>navigate</span>
					</div>
				</div>

				{/* Results List */}
				<div ref={listRef} className="max-h-72 overflow-y-auto">
					{isLoading && query ? (
						<div className="px-4 py-8 text-center text-sm text-muted-foreground/60">
							Searching...
						</div>
					) : results.length === 0 ? (
						<div className="px-4 py-8 text-center text-sm text-muted-foreground/60">
							{query ? "No matching commands" : "No command history"}
						</div>
					) : (
						<div className="py-1">
							{results.map((item, index) => (
								<button
									key={`${item.command}-${item.timestamp}`}
									type="button"
									onClick={() => handleItemClick(item.command)}
									className={`flex w-full items-center px-4 py-2 text-left transition-colors ${
										index === selectedIndex
											? "bg-accent text-accent-foreground"
											: "text-foreground hover:bg-accent/50"
									}`}
								>
									<span className="mr-3 text-muted-foreground/40">
										<svg
											aria-hidden="true"
											className="size-3.5"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={1.5}
												d="M8 9l4-4 4 4m0 6l-4 4-4-4"
											/>
										</svg>
									</span>
									<span className="flex-1 truncate font-mono text-sm">
										{highlightMatch(item.command, query)}
									</span>
									{index === selectedIndex && (
										<kbd className="ml-3 rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
											↵
										</kbd>
									)}
								</button>
							))}
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-muted-foreground/50">
					<span>Command History</span>
					<div className="flex items-center gap-3">
						<span>
							<kbd className="rounded bg-muted/30 px-1 py-0.5 font-mono">
								esc
							</kbd>{" "}
							to close
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}
