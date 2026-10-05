import { useEffect, useReducer, useRef } from "react";
import { revealEnd } from "../../utils/revealEnd";

const MIN_CHARS_PER_SECOND = 90;
const CATCH_UP_SECONDS = 0.22;
const MAX_FRAME_SECONDS = 0.05;
const HOLD_PARTIAL_WORD_MS = 150;

/** Whole words at a steady pace; text already present at mount shows at once. */
export function usePacedText(
	text: string,
	streaming: boolean,
): { text: string; revealing: boolean } {
	const shown = useRef(text.length);
	const pacing = useRef(streaming);
	const [, rerender] = useReducer((count: number) => count + 1, 0);
	if (streaming) pacing.current = true;
	if (!pacing.current) shown.current = text.length;
	shown.current = Math.min(shown.current, text.length);
	const behind = shown.current < text.length;

	useEffect(() => {
		if (!pacing.current) return;
		if (!behind) {
			if (!streaming) pacing.current = false;
			return;
		}
		let position = shown.current;
		let last = performance.now();
		let hold = 0;
		const tick = (now: number) => {
			const seconds = Math.min(MAX_FRAME_SECONDS, (now - last) / 1000);
			last = now;
			const backlog = text.length - position;
			const speed = Math.max(MIN_CHARS_PER_SECOND, backlog / CATCH_UP_SECONDS);
			position = Math.min(text.length, position + speed * seconds);
			const end = revealEnd(text, position, streaming);
			if (end > shown.current) {
				shown.current = end;
				rerender();
			}
			if (position < text.length) {
				frame = requestAnimationFrame(tick);
			} else if (shown.current < text.length) {
				hold = window.setTimeout(() => {
					shown.current = text.length;
					rerender();
				}, HOLD_PARTIAL_WORD_MS);
			}
		};
		let frame = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(frame);
			window.clearTimeout(hold);
		};
	}, [text, streaming, behind]);

	return {
		text: behind ? text.slice(0, shown.current) : text,
		revealing: behind,
	};
}
