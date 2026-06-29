/**
 * Compute the next slice of streaming chat text to display.
 *
 * `target` is the full message text we've received so far; `previous` is what
 * we've already painted. We advance up to `charsPerTick` UTF-16 code units, but
 * never end the slice between the two halves of a surrogate pair — a lone
 * surrogate renders as a replacement glyph (the "mojibake" reported in #4914
 * for Japanese supplementary-plane kanji and emojis).
 */
export function advanceStreamingText(
	previous: string,
	target: string,
	charsPerTick: number,
): string {
	if (previous.length >= target.length) return previous;

	let nextLength = Math.min(target.length, previous.length + charsPerTick);

	const lastUnit = target.charCodeAt(nextLength - 1);
	const isHighSurrogate = lastUnit >= 0xd800 && lastUnit <= 0xdbff;
	if (isHighSurrogate && nextLength < target.length) {
		nextLength += 1;
	}

	return target.slice(0, nextLength);
}
