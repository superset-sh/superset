import { useLingui } from "@lingui/react/macro";
import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { browserRuntimeRegistry } from "../../browserRuntimeRegistry";

interface BrowserFindBarProps {
	paneId: string;
	onClose: () => void;
}

/** Chrome-style find-in-page bar, floating over the page like the real thing. */
export function BrowserFindBar({ paneId, onClose }: BrowserFindBarProps) {
	const { t } = useLingui();
	const [query, setQuery] = useState("");
	const [match, setMatch] = useState<{ ordinal: number; total: number } | null>(
		null,
	);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);

	useEffect(() => {
		return browserRuntimeRegistry.onFoundInPage(paneId, (result) => {
			setMatch({ ordinal: result.activeMatchOrdinal, total: result.matches });
		});
	}, [paneId]);

	useEffect(() => {
		return () => {
			browserRuntimeRegistry.stopFindInPage(paneId, "clearSelection");
		};
	}, [paneId]);

	const runSearch = (text: string, forward: boolean, findNext: boolean) => {
		if (!text) {
			setMatch(null);
			browserRuntimeRegistry.stopFindInPage(paneId, "clearSelection");
			return;
		}
		browserRuntimeRegistry.findInPage(paneId, text, { forward, findNext });
	};

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setQuery(value);
		// The old query's count no longer describes anything — drop it until
		// the new search reports back (repopulated by the next found-in-page).
		setMatch(null);
		// findNext: true starts a new find session — required here since the
		// search text itself just changed (Electron's naming is backwards from
		// what it sounds like: true = initial/new-term request, false = a
		// follow-up within the same still-active session).
		runSearch(value, true, true);
	};

	const goNext = () => runSearch(query, true, false);
	const goPrev = () => runSearch(query, false, false);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			e.preventDefault();
			onClose();
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (e.shiftKey) goPrev();
			else goNext();
		}
	};

	return (
		<div className="absolute right-3 top-3 z-30 flex items-center gap-1 rounded-md border border-border bg-popover px-2 py-1 text-xs shadow-md">
			<input
				ref={inputRef}
				value={query}
				onChange={handleChange}
				onKeyDown={handleKeyDown}
				placeholder={t({
					id: "workspace.browserPane.findInPagePlaceholder",
					message: "Find in page",
				})}
				className="h-6 w-40 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/50"
				spellCheck={false}
				autoComplete="off"
			/>
			{/* Counts render only once a found-in-page result has arrived —
			    before that (or if the event never fires) "0/0" would falsely
			    claim the page was searched and had no matches. */}
			{query && match && (
				<span className="shrink-0 text-muted-foreground/70 tabular-nums">
					{match.total > 0 ? `${match.ordinal}/${match.total}` : "0/0"}
				</span>
			)}
			<button
				type="button"
				onClick={goPrev}
				disabled={!query}
				aria-label={t({
					id: "workspace.browserPane.findPreviousMatch",
					message: "Previous match",
				})}
				className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
			>
				<ChevronUpIcon className="size-3.5" />
			</button>
			<button
				type="button"
				onClick={goNext}
				disabled={!query}
				aria-label={t({
					id: "workspace.browserPane.findNextMatch",
					message: "Next match",
				})}
				className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
			>
				<ChevronDownIcon className="size-3.5" />
			</button>
			<button
				type="button"
				onClick={onClose}
				aria-label={t({
					id: "workspace.browserPane.closeFindBar",
					message: "Close find bar",
				})}
				className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground"
			>
				<XIcon className="size-3.5" />
			</button>
		</div>
	);
}
