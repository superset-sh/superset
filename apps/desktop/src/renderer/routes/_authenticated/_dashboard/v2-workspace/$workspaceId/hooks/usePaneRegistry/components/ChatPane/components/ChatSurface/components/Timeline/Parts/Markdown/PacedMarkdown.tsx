/**
 * PacedMarkdown — reveals streaming text at ~24ms per chunk, snapping
 * to whitespace so words don't split mid-render. Wraps MarkdownStream
 * so the stable-prefix optimization applies to the revealed portion
 * while the tail streams in.
 *
 * When `live` flips to false, immediately syncs to the full text.
 * Ported from OpenCode's createPacedValue (message-part.tsx:235).
 */

import { useEffect, useRef, useState } from "react";
import { MarkdownStream } from "./MarkdownStream";
import { nextChunkBoundary } from "./MarkdownStream.logic";

const PACE_MS = 24;

export interface PacedMarkdownProps {
	text: string;
	live: boolean;
}

export function PacedMarkdown({ text, live }: PacedMarkdownProps) {
	const [shown, setShown] = useState(text);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (!live) {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
			setShown(text);
			return;
		}
		// While live, advance toward `text` in small chunks.
		let cancelled = false;
		const tick = () => {
			if (cancelled) return;
			setShown((prev) => {
				if (prev === text) return prev;
				// If the text shrank (user message re-sent? revert?), snap.
				if (!text.startsWith(prev)) return text;
				const end = nextChunkBoundary(text, prev.length);
				return text.slice(0, end);
			});
			timerRef.current = setTimeout(tick, PACE_MS);
		};
		tick();
		return () => {
			cancelled = true;
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
		};
	}, [text, live]);

	return <MarkdownStream text={shown} live={live} />;
}
