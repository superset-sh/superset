import { Input } from "@superset/ui/input";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuX } from "react-icons/lu";

const FILTER_DEBOUNCE_MS = 150;

interface ChangesFilterInputProps {
	filterTerm: string;
	onFilterChange: (term: string) => void;
}

/**
 * Debounced search/filter input for the diff view file lists. Mirrors the
 * behavior of the FilesView FileTreeToolbar search box so the two panels feel
 * consistent.
 */
export function ChangesFilterInput({
	filterTerm,
	onFilterChange,
}: ChangesFilterInputProps) {
	const [localFilterTerm, setLocalFilterTerm] = useState(filterTerm);
	const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (debounceTimeoutRef.current) {
			clearTimeout(debounceTimeoutRef.current);
			debounceTimeoutRef.current = null;
		}
		setLocalFilterTerm(filterTerm);
	}, [filterTerm]);

	useEffect(() => {
		return () => {
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current);
			}
		};
	}, []);

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = e.target.value;
			setLocalFilterTerm(value);

			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current);
			}

			debounceTimeoutRef.current = setTimeout(() => {
				onFilterChange(value);
				debounceTimeoutRef.current = null;
			}, FILTER_DEBOUNCE_MS);
		},
		[onFilterChange],
	);

	const handleClear = useCallback(() => {
		setLocalFilterTerm("");
		if (debounceTimeoutRef.current) {
			clearTimeout(debounceTimeoutRef.current);
			debounceTimeoutRef.current = null;
		}
		onFilterChange("");
	}, [onFilterChange]);

	return (
		<div className="relative px-2 py-1.5 border-b border-border">
			<Input
				type="text"
				placeholder="Filter changed files..."
				value={localFilterTerm}
				onChange={handleChange}
				className="h-7 text-xs pr-7"
			/>
			{localFilterTerm && (
				<button
					type="button"
					onClick={handleClear}
					aria-label="Clear filter"
					className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted-foreground/20 transition-colors"
				>
					<LuX className="size-3.5" />
				</button>
			)}
		</div>
	);
}
