/**
 * Ctrl/Cmd+F in-chat search. Opens an overlay pill at the top of the
 * timeline; arrow keys cycle matches; Escape closes. Scrolls the
 * matched message into view when the index changes.
 */

import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChatStore } from "../../../../store";
import { findChatMatches } from "./ChatSearch.logic";

export interface ChatSearchProps {
	sessionId: string;
	open: boolean;
	onClose: () => void;
}

export function ChatSearch({ sessionId, open, onClose }: ChatSearchProps) {
	const [query, setQuery] = useState("");
	const [caseSensitive, setCaseSensitive] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);

	const messages = useChatStore((s) => s.messages[sessionId]);
	const parts = useChatStore((s) => s.parts);

	const matches = useMemo(() => {
		if (!query || !messages) return [];
		return findChatMatches({ messages, parts }, query, { caseSensitive });
	}, [messages, parts, query, caseSensitive]);

	useEffect(() => {
		if (open) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [open]);

	useEffect(() => {
		if (activeIndex >= matches.length) setActiveIndex(0);
	}, [matches, activeIndex]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	// Scroll matched message into view when the active index changes.
	useEffect(() => {
		if (!open || matches.length === 0) return;
		const target = matches[activeIndex];
		if (!target) return;
		const el = document.querySelector<HTMLElement>(
			`[data-message-id="${target.messageID}"]`,
		);
		el?.scrollIntoView({ block: "center", behavior: "smooth" });
	}, [open, matches, activeIndex]);

	const next = useCallback(() => {
		if (matches.length === 0) return;
		setActiveIndex((i) => (i + 1) % matches.length);
	}, [matches.length]);

	const prev = useCallback(() => {
		if (matches.length === 0) return;
		setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
	}, [matches.length]);

	const onFormKey = (e: React.KeyboardEvent<HTMLFormElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			if (e.shiftKey) prev();
			else next();
		}
	};

	if (!open) return null;

	return (
		<div className="absolute top-3 right-4 z-20 flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs shadow-md">
			<form
				onSubmit={(e) => {
					e.preventDefault();
					next();
				}}
				onKeyDown={onFormKey}
			>
				<input
					ref={inputRef}
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setActiveIndex(0);
					}}
					placeholder="Find in chat"
					className="bg-transparent text-sm focus:outline-none"
				/>
			</form>
			<button
				type="button"
				className={`text-muted-foreground hover:text-foreground rounded px-1 text-[10px] uppercase ${
					caseSensitive ? "bg-muted" : ""
				}`}
				onClick={() => setCaseSensitive((v) => !v)}
				title="Case sensitive"
			>
				Aa
			</button>
			<div className="text-muted-foreground mx-1 text-[10px] tabular-nums">
				{matches.length === 0
					? "0"
					: `${activeIndex + 1} / ${matches.length}`}
			</div>
			<button
				type="button"
				onClick={prev}
				className="text-muted-foreground hover:text-foreground rounded p-1"
				title="Previous (Shift+Enter)"
			>
				<ChevronUp className="size-3" />
			</button>
			<button
				type="button"
				onClick={next}
				className="text-muted-foreground hover:text-foreground rounded p-1"
				title="Next (Enter)"
			>
				<ChevronDown className="size-3" />
			</button>
			<button
				type="button"
				onClick={onClose}
				className="text-muted-foreground hover:text-foreground rounded p-1"
				title="Close (Esc)"
			>
				<X className="size-3" />
			</button>
		</div>
	);
}
