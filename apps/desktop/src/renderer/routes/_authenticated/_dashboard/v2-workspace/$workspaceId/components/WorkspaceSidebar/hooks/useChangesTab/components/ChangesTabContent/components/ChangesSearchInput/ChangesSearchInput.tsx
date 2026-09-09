import { useLingui } from "@lingui/react/macro";
import { Search, X } from "lucide-react";
import { useEffect, useRef } from "react";

interface ChangesSearchInputProps {
	query: string;
	onQueryChange: (query: string) => void;
	/** Escape closes the row (the toolbar's toggle clears the query with it). */
	onClose: () => void;
}

/**
 * The Changes tab's file search row, mounted while the toolbar's search
 * toggle is on. Filters the changed-file list by path as the user types;
 * Escape or the toolbar toggle dismisses it, the ✕ only clears the query.
 */
export function ChangesSearchInput({
	query,
	onQueryChange,
	onClose,
}: ChangesSearchInputProps) {
	const { t } = useLingui();
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	return (
		<div className="mx-1.5 mt-1 flex items-center gap-1 rounded-md bg-fill-hover px-1.5">
			<Search className="size-3 shrink-0 text-muted-foreground" />
			<input
				ref={inputRef}
				value={query}
				onChange={(event) => onQueryChange(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.stopPropagation();
						onClose();
					}
				}}
				placeholder={t({
					message: "Search files…",
				})}
				aria-label={t({
					message: "Search changed files",
				})}
				className="h-6 w-full min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
			/>
			{query !== "" && (
				<button
					type="button"
					aria-label={t({
						message: "Clear search",
					})}
					// preventDefault on mousedown so the input never blurs; the
					// clearing lives in onClick so keyboard activation works too.
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => {
						onQueryChange("");
						inputRef.current?.focus();
					}}
					className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
				>
					<X className="size-3" />
				</button>
			)}
		</div>
	);
}
