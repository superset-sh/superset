import { useLingui } from "@lingui/react/macro";

interface SearchBoxProps {
	value: string;
	onChange: (value: string) => void;
	busy?: boolean;
}

export function SearchBox({ value, onChange, busy }: SearchBoxProps) {
	const { t } = useLingui();

	return (
		<div className="relative w-full sm:max-w-xs">
			<span
				aria-hidden="true"
				className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[0.7rem] text-muted-foreground/60"
			>
				⌕
			</span>
			<input
				type="search"
				data-search="developers"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={t({
					message: "Search developers",
				})}
				aria-label={t({
					message: "Search developers by handle or name",
				})}
				className="[&::-webkit-search-cancel-button]:appearance-none w-full rounded-[2px] border border-border bg-transparent min-h-11 pl-8 pr-12 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 placeholder:normal-case focus:outline-none focus:border-brand/60 transition-colors"
			/>
			{value && (
				<button
					type="button"
					onClick={() => onChange("")}
					aria-label={t({
						message: "Clear search",
					})}
					className="absolute right-0 min-h-11 min-w-11 top-1/2 -translate-y-1/2 font-mono text-[0.7rem] text-muted-foreground/60 hover:text-foreground transition-colors"
				>
					{busy ? "…" : "×"}
				</button>
			)}
		</div>
	);
}
