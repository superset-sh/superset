import { useEffect, useRef } from "react";
import { TbGlobe } from "react-icons/tb";
import type { HistorySuggestion } from "../../hooks/useUrlAutocomplete";

interface UrlSuggestionsProps {
	suggestions: HistorySuggestion[];
	highlightedIndex: number;
	onSelect: (url: string) => void;
}

export function UrlSuggestions({
	suggestions,
	highlightedIndex,
	onSelect,
}: UrlSuggestionsProps) {
	const listRef = useRef<HTMLDivElement>(null);

	// Scroll highlighted item into view
	useEffect(() => {
		if (highlightedIndex < 0 || !listRef.current) return;
		const items = listRef.current.children;
		const item = items[highlightedIndex] as HTMLElement | undefined;
		item?.scrollIntoView({ block: "nearest" });
	}, [highlightedIndex]);

	if (suggestions.length === 0) return null;

	return (
		<div
			ref={listRef}
			className="absolute top-full left-0 right-0 mt-1 z-50 max-h-[320px] overflow-y-auto rounded-md border border-border bg-popover shadow-md"
		>
			{suggestions.map((item, index) => (
				<button
					key={item.url}
					type="button"
					// Use onMouseDown + preventDefault to beat input blur race
					onMouseDown={(e) => {
						e.preventDefault();
						onSelect(item.url);
					}}
					className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors ${
						index === highlightedIndex ? "bg-accent" : "hover:bg-accent/50"
					}`}
				>
					{item.faviconUrl ? (
						<img
							src={item.faviconUrl}
							alt=""
							className="size-4 shrink-0 rounded-sm"
							onError={(e) => {
								// Fallback to globe on load error
								e.currentTarget.style.display = "none";
								e.currentTarget.nextElementSibling?.classList.remove("hidden");
							}}
						/>
					) : null}
					{!item.faviconUrl ? (
						<TbGlobe className="size-4 shrink-0 text-muted-foreground/50" />
					) : (
						<TbGlobe className="hidden size-4 shrink-0 text-muted-foreground/50" />
					)}
					<div className="min-w-0 flex-1">
						<div className="truncate text-foreground">
							{item.title || item.url}
						</div>
						{item.title && (
							<div className="truncate text-muted-foreground/60">
								{item.url}
							</div>
						)}
					</div>
				</button>
			))}
		</div>
	);
}
