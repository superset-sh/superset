/**
 * Pure logic for splitting a streaming markdown buffer into a stable
 * prefix and an unstable tail that is currently being extended. The UI
 * memoizes the stable prefix and re-renders only the tail, so long
 * assistant messages don't flicker while the last paragraph streams in.
 *
 * Ported from OpenCode's markdown-stream.ts.
 */

export interface MarkdownStreamBlock {
	raw: string;
	/**
	 * "full" when the content is fully settled and should render as a
	 * normal markdown block. "live" when this is the actively-streaming
	 * tail — the caller should assume it might still change.
	 */
	mode: "full" | "live";
}

/**
 * Split the input text into blocks. When `live` is false we return a
 * single `full` block. When `live` is true we detect an unterminated
 * fenced code block and split there so the stable prose above stays
 * memoized.
 */
export function splitMarkdownStream(
	text: string,
	live: boolean,
): MarkdownStreamBlock[] {
	if (!live) {
		if (!text) return [];
		return [{ raw: text, mode: "full" }];
	}
	if (!text) return [];

	const openFenceIdx = findUnterminatedFence(text);
	if (openFenceIdx < 0) {
		return [{ raw: text, mode: "live" }];
	}

	// Split at the start of the unterminated fence line.
	const fenceLineStart = lineStartIndex(text, openFenceIdx);
	const head = text.slice(0, fenceLineStart);
	const tail = text.slice(fenceLineStart);

	const blocks: MarkdownStreamBlock[] = [];
	if (head) blocks.push({ raw: head, mode: "live" });
	if (tail) blocks.push({ raw: tail, mode: "live" });
	return blocks;
}

/** Index of the opening ``` fence that has no matching closing fence. */
function findUnterminatedFence(text: string): number {
	const regex = /^```/gm;
	let match: RegExpExecArray | null;
	let lastOpen = -1;
	let fenceCount = 0;
	while ((match = regex.exec(text)) !== null) {
		fenceCount += 1;
		if (fenceCount % 2 === 1) lastOpen = match.index;
	}
	if (fenceCount % 2 === 0) return -1;
	return lastOpen;
}

function lineStartIndex(text: string, position: number): number {
	// Walk backward to the last newline character.
	const newline = text.lastIndexOf("\n", position - 1);
	return newline < 0 ? 0 : newline + 1;
}

/**
 * Compute the next chunk boundary for PacedMarkdown. Snaps to
 * whitespace where possible so we don't split mid-word.
 *
 * Chunk size scales with text length — very short messages reveal
 * almost at once, long ones reveal in ~24ms windows by default.
 */
export function nextChunkBoundary(
	text: string,
	shownLength: number,
): number {
	if (shownLength >= text.length) return text.length;
	const remaining = text.length - shownLength;
	const step = chunkStep(text.length);
	let end = Math.min(text.length, shownLength + step);
	if (end >= text.length) return text.length;

	// Prefer a whitespace boundary close to the chunk end.
	const search = text.slice(shownLength, end + Math.min(12, remaining));
	const nextWs = search.search(/\s/);
	if (nextWs >= 0 && shownLength + nextWs + 1 <= text.length) {
		end = shownLength + nextWs + 1;
	}
	return end;
}

function chunkStep(total: number): number {
	if (total <= 120) return 2;
	if (total <= 400) return 4;
	if (total <= 1200) return 8;
	if (total <= 4000) return 16;
	return 24;
}
