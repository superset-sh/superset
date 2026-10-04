import { Trans, useLingui } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { cn } from "@superset/ui/utils";
import { useEffect, useRef } from "react";
import { HiChevronDown, HiChevronUp, HiMiniXMark } from "react-icons/hi2";
import { PiTextAa } from "react-icons/pi";
import type { SearchStatus } from "../../hooks/useSheetSearch";

interface SheetSearchProps {
	query: string;
	status: SearchStatus;
	caseSensitive: boolean;
	matchCount: number;
	truncated: boolean;
	activeIndex: number;
	onQueryChange: (query: string) => void;
	onCaseSensitiveChange: (caseSensitive: boolean) => void;
	onFindNext: () => void;
	onFindPrevious: () => void;
	onClose: () => void;
}

const ICON_BUTTON =
	"rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function SheetSearch({
	query,
	status,
	caseSensitive,
	matchCount,
	truncated,
	activeIndex,
	onQueryChange,
	onCaseSensitiveChange,
	onFindNext,
	onFindPrevious,
	onClose,
}: SheetSearchProps) {
	const { t } = useLingui();
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);

	const current = formatNumber(activeIndex + 1);
	const total = `${formatNumber(matchCount)}${truncated ? "+" : ""}`;

	return (
		<div className="absolute top-1 right-3 z-30 flex max-w-[calc(100%-1rem)] items-center rounded bg-popover/95 pr-0.5 pl-2 shadow-lg ring-1 ring-border/40 backdrop-blur">
			<input
				ref={inputRef}
				type="text"
				value={query}
				aria-label={t({ message: "Find" })}
				placeholder={t({ message: "Find" })}
				onChange={(event) => onQueryChange(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						onClose();
					} else if (event.key === "Enter") {
						event.preventDefault();
						if (event.shiftKey) onFindPrevious();
						else onFindNext();
					}
				}}
				className="h-6 w-32 min-w-0 shrink bg-transparent text-foreground text-sm placeholder:text-muted-foreground focus:outline-none"
			/>
			{query && (
				<span className="whitespace-nowrap px-1 text-muted-foreground text-xs tabular-nums">
					{status === "pending" ? (
						<Trans>Searching…</Trans>
					) : status === "error" ? (
						<Trans>Search failed</Trans>
					) : matchCount === 0 ? (
						<Trans>No results</Trans>
					) : (
						<Trans>
							{current} of {total}
						</Trans>
					)}
				</span>
			)}
			<div className="flex shrink-0 items-center">
				<button
					type="button"
					aria-pressed={caseSensitive}
					title={t({ message: "Match case" })}
					onClick={() => onCaseSensitiveChange(!caseSensitive)}
					className={cn(
						ICON_BUTTON,
						caseSensitive && "bg-primary/20 text-foreground",
					)}
				>
					<PiTextAa className="size-3.5" />
				</button>
				<button
					type="button"
					title={t({ message: "Previous match" })}
					onClick={onFindPrevious}
					className={ICON_BUTTON}
				>
					<HiChevronUp className="size-3.5" />
				</button>
				<button
					type="button"
					title={t({ message: "Next match" })}
					onClick={onFindNext}
					className={ICON_BUTTON}
				>
					<HiChevronDown className="size-3.5" />
				</button>
				<button
					type="button"
					title={t({ message: "Close" })}
					onClick={onClose}
					className={ICON_BUTTON}
				>
					<HiMiniXMark className="size-3.5" />
				</button>
			</div>
		</div>
	);
}
