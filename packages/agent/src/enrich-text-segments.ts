/**
 * Enriches TEXT_MESSAGE_CONTENT chunks with a `content` field so
 * TanStack AI's StreamProcessor can detect text segment boundaries.
 *
 * Problem: StreamProcessor.isNewTextSegment() only fires when `content`
 * is present. Without it, text accumulates across agent turns — each
 * successive text part contains ALL previous text instead of just the
 * current segment.
 *
 * Solution: Track per-segment accumulated text and inject `content`.
 * When text follows tool calls, the accumulator resets so `content`
 * is shorter than the previous segment, triggering a new segment.
 *
 * @example
 * ```ts
 * const enrich = createTextSegmentEnricher();
 * for (const chunk of chunks) {
 *   processor.processChunk(enrich(chunk));
 * }
 * ```
 */
export function createTextSegmentEnricher(): <
	T extends { type: string; [key: string]: unknown },
>(
	chunk: T,
) => T {
	let segmentText = "";
	let hadToolSinceText = false;

	return (chunk) => {
		if (chunk.type === "TEXT_MESSAGE_CONTENT") {
			if (hadToolSinceText) {
				segmentText = "";
				hadToolSinceText = false;
			}
			const delta = (chunk as { delta?: string }).delta ?? "";
			segmentText += delta;
			if ((chunk as { content?: string }).content === undefined) {
				(chunk as { content?: string }).content = segmentText;
			}
		} else if (
			chunk.type === "TOOL_CALL_START" ||
			chunk.type === "TOOL_CALL_END"
		) {
			hadToolSinceText = true;
		}
		return chunk;
	};
}
