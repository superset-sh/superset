import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useEffect, useRef } from "react";
import { HiMagnifyingGlass, HiXMark } from "react-icons/hi2";

interface DashboardSidebarProjectsFilterInputProps {
	query: string;
	onQueryChange: (query: string) => void;
	isExpanded: boolean;
	onExpandedChange: (expanded: boolean) => void;
}

/**
 * The Projects header's filter: a magnifier button that expands into an
 * inline text input. Lives inside the header strip, which toggles the
 * section on click/Enter/Space, so every interaction here stops propagation.
 */
export function DashboardSidebarProjectsFilterInput({
	query,
	onQueryChange,
	isExpanded,
	onExpandedChange,
}: DashboardSidebarProjectsFilterInputProps) {
	const { t } = useLingui();
	const inputRef = useRef<HTMLInputElement>(null);

	// Focus when the user opens the input, not when the header remounts with
	// it already open (the bulk-selection toolbar swaps the header out and
	// back in); clearing a selection must not move focus into the filter.
	const wasExpandedRef = useRef(isExpanded);
	useEffect(() => {
		if (isExpanded && !wasExpandedRef.current) inputRef.current?.focus();
		wasExpandedRef.current = isExpanded;
	}, [isExpanded]);

	const filterLabel = t({
		message: "Filter projects",
	});

	if (!isExpanded) {
		return (
			<Tooltip delayDuration={700}>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label={filterLabel}
						onClick={(event) => {
							event.stopPropagation();
							onExpandedChange(true);
						}}
						onKeyDown={(event) => event.stopPropagation()}
						className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
					>
						<HiMagnifyingGlass className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">{filterLabel}</TooltipContent>
			</Tooltip>
		);
	}

	const collapse = () => {
		onQueryChange("");
		onExpandedChange(false);
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: stops the header row's collapse toggle from firing on input interaction
		<div
			className="flex min-w-0 flex-1 items-center gap-1 rounded-md bg-fill-hover px-1.5"
			onClick={(event) => event.stopPropagation()}
			onKeyDown={(event) => {
				event.stopPropagation();
				if (event.key === "Escape") collapse();
			}}
		>
			<HiMagnifyingGlass className="size-3 shrink-0 text-muted-foreground" />
			<input
				ref={inputRef}
				value={query}
				onChange={(event) => onQueryChange(event.target.value)}
				onBlur={() => {
					if (query.trim() === "") collapse();
				}}
				placeholder={t({
					message: "Filter projects…",
				})}
				aria-label={filterLabel}
				className="h-6 w-full min-w-0 bg-transparent text-xs font-normal normal-case tracking-normal text-foreground placeholder:text-muted-foreground focus:outline-none"
			/>
			{query !== "" && (
				<button
					type="button"
					aria-label={t({
						message: "Clear filter",
					})}
					// preventDefault on mousedown so the input never blurs; the
					// clearing lives in onClick so keyboard activation works too.
					onMouseDown={(event) => {
						event.preventDefault();
						event.stopPropagation();
					}}
					onClick={(event) => {
						event.stopPropagation();
						onQueryChange("");
						inputRef.current?.focus();
					}}
					className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
				>
					<HiXMark className="size-3" />
				</button>
			)}
		</div>
	);
}
