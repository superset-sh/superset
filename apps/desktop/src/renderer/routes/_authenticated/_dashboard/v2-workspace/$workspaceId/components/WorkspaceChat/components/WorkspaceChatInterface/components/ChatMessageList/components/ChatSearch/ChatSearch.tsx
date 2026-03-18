import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useEffect, useRef } from "react";
import { HiChevronDown, HiChevronUp, HiMiniXMark } from "react-icons/hi2";
import { PiTextAa } from "react-icons/pi";

interface ChatSearchProps {
	isOpen: boolean;
	query: string;
	caseSensitive: boolean;
	matchCount: number;
	activeMatchIndex: number;
	onQueryChange: (query: string) => void;
	onCaseSensitiveChange: (caseSensitive: boolean) => void;
	onFindNext: () => void;
	onFindPrevious: () => void;
	onClose: () => void;
}

export function ChatSearch({
	isOpen,
	query,
	caseSensitive,
	matchCount,
	activeMatchIndex,
	onQueryChange,
	onCaseSensitiveChange,
	onFindNext,
	onFindPrevious,
	onClose,
}: ChatSearchProps) {
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (isOpen && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isOpen]);

	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "Escape") {
			event.preventDefault();
			onClose();
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			if (event.shiftKey) {
				onFindPrevious();
			} else {
				onFindNext();
			}
		}
	};

	if (!isOpen) return null;

	return (
		<div className="absolute top-2 right-12 z-30 flex max-w-[calc(100%-4rem)] items-center rounded bg-popover/95 pl-2 pr-0.5 shadow-lg ring-1 ring-border/40 backdrop-blur">
			<input
				ref={inputRef}
				type="text"
				aria-label="Find in chat"
				value={query}
				onChange={(event) => onQueryChange(event.target.value)}
				onKeyDown={handleKeyDown}
				placeholder="Find in chat"
				className="h-6 min-w-0 w-32 flex-shrink bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
			/>
			{query && (
				<span className="whitespace-nowrap px-1 text-xs text-muted-foreground">
					{matchCount === 0
						? "No results"
						: `${activeMatchIndex + 1} of ${matchCount}`}
				</span>
			)}
			<div className="flex shrink-0 items-center">
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label="Match case"
							aria-pressed={caseSensitive}
							onClick={() => onCaseSensitiveChange(!caseSensitive)}
							className={`rounded p-1 transition-colors ${
								caseSensitive
									? "bg-primary/20 text-foreground"
									: "text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
							}`}
						>
							<PiTextAa className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Match case</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label="Find previous match"
							onClick={onFindPrevious}
							className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
						>
							<HiChevronUp className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Previous (Shift+Enter)</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label="Find next match"
							onClick={onFindNext}
							className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
						>
							<HiChevronDown className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Next (Enter)</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label="Close find in chat"
							onClick={onClose}
							className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
						>
							<HiMiniXMark className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Close (Esc)</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
