import { HiXMark } from "react-icons/hi2";

interface SearchResultsBannerProps {
	query: string;
	matchCount: number;
	onClear: () => void;
}

export function SearchResultsBanner({
	query,
	matchCount,
	onClear,
}: SearchResultsBannerProps) {
	const hasMatches = matchCount > 0;

	return (
		<div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 px-6 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/85">
			<p className="flex-1 truncate text-xs text-muted-foreground">
				{hasMatches ? (
					<>
						<span className="tabular-nums font-medium text-foreground">
							{matchCount}
						</span>
						{matchCount === 1 ? " result" : " results"} for &ldquo;
						{query}&rdquo;
					</>
				) : (
					<>No results for &ldquo;{query}&rdquo;</>
				)}
			</p>
			<button
				type="button"
				onClick={onClear}
				aria-label="Clear search"
				className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground transition-colors"
			>
				<HiXMark className="h-3.5 w-3.5" />
			</button>
		</div>
	);
}
