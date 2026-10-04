import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { HiChevronLeft, HiChevronRight } from "react-icons/hi2";
import type { SheetSummary } from "../../types";

interface SheetTabsProps {
	sheets: SheetSummary[];
	activeIndex: number;
	onSelect: (index: number) => void;
}

const SCROLL_BUTTON =
	"shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40";

const ARROW_STEPS: Record<string, (index: number, count: number) => number> = {
	ArrowLeft: (index, count) => (index - 1 + count) % count,
	ArrowRight: (index, count) => (index + 1) % count,
	Home: () => 0,
	End: (_, count) => count - 1,
};

export function SheetTabs({ sheets, activeIndex, onSelect }: SheetTabsProps) {
	const { t } = useLingui();
	const listRef = useRef<HTMLDivElement>(null);
	const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const [overflow, setOverflow] = useState({ start: false, end: false });

	useEffect(() => {
		const list = listRef.current;
		if (!list) return;
		const update = () => {
			const max = list.scrollWidth - list.clientWidth;
			setOverflow({
				start: max > 1 && list.scrollLeft > 1,
				end: max > 1 && list.scrollLeft < max - 1,
			});
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(list);
		list.addEventListener("scroll", update, { passive: true });
		return () => {
			observer.disconnect();
			list.removeEventListener("scroll", update);
		};
	}, []);

	useEffect(() => {
		const list = listRef.current;
		const tab = tabRefs.current[activeIndex];
		if (!list || !tab) return;
		if (tab.offsetLeft < list.scrollLeft) {
			list.scrollLeft = tab.offsetLeft;
		} else if (
			tab.offsetLeft + tab.offsetWidth >
			list.scrollLeft + list.clientWidth
		) {
			list.scrollLeft = tab.offsetLeft + tab.offsetWidth - list.clientWidth;
		}
	}, [activeIndex]);

	const scrollBy = (direction: 1 | -1) => {
		const list = listRef.current;
		if (list) list.scrollLeft += direction * list.clientWidth * 0.75;
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		const step = ARROW_STEPS[event.key];
		if (!step) return;
		event.preventDefault();
		const next = step(activeIndex, sheets.length);
		onSelect(next);
		tabRefs.current[next]?.focus();
	};

	const scrollable = overflow.start || overflow.end;

	return (
		<div className="flex h-7 shrink-0 items-center gap-0.5 border-border border-t px-1">
			{scrollable && (
				<button
					type="button"
					tabIndex={-1}
					title={t({ message: "Previous sheets" })}
					disabled={!overflow.start}
					onClick={() => scrollBy(-1)}
					className={SCROLL_BUTTON}
				>
					<HiChevronLeft className="size-3.5" />
				</button>
			)}
			<div
				ref={listRef}
				role="tablist"
				aria-label={t({ message: "Sheets" })}
				onKeyDown={handleKeyDown}
				className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]"
			>
				{sheets.map((sheet, index) => {
					const active = index === activeIndex;
					return (
						<button
							// biome-ignore lint/suspicious/noArrayIndexKey: sheet names can repeat across reloads, the index is the identity
							key={index}
							ref={(element) => {
								tabRefs.current[index] = element;
							}}
							type="button"
							role="tab"
							aria-selected={active}
							tabIndex={active ? 0 : -1}
							title={sheet.name}
							className={cn(
								"h-5 max-w-48 shrink-0 truncate rounded-sm px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
								active
									? "bg-muted text-foreground"
									: "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
								sheet.hidden && "italic opacity-70",
							)}
							onClick={() => onSelect(index)}
						>
							{sheet.name}
						</button>
					);
				})}
			</div>
			{scrollable && (
				<button
					type="button"
					tabIndex={-1}
					title={t({ message: "Next sheets" })}
					disabled={!overflow.end}
					onClick={() => scrollBy(1)}
					className={SCROLL_BUTTON}
				>
					<HiChevronRight className="size-3.5" />
				</button>
			)}
		</div>
	);
}
