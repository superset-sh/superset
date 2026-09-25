import { useLingui } from "@lingui/react/macro";

interface SearchBoxProps {
	value: string;
	onChange: (value: string) => void;
	busy?: boolean;
}

export function SearchBox({ value, onChange, busy }: SearchBoxProps) {
	const { t } = useLingui();

	return (
		<div className="relative w-full max-w-xs">
			<span
				aria-hidden="true"
				className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[0.7rem] text-muted-foreground/60"
			>
				⌕
			</span>
			<input
				type="text"
				data-search="developers"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={t({
					message: "Search developers",
				})}
				aria-label={t({
					message: "Search developers by handle or name",
				})}
				className="w-full border border-border bg-transparent pl-8 pr-8 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.1em] text-foreground placeholder:text-muted-foreground/50 placeholder:normal-case focus:outline-none focus:border-brand/60 transition-colors"
			/>
			{value && (
				<button
					type="button"
					onClick={() => onChange("")}
					aria-label={t({
						message: "Clear search",
					})}
					className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[0.7rem] text-muted-foreground/60 hover:text-foreground transition-colors"
				>
					{busy ? "…" : "×"}
				</button>
			)}
		</div>
	);
}
