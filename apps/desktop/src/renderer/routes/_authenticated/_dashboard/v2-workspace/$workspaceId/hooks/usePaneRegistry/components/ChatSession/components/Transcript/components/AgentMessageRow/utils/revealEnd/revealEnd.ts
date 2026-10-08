const UNSPACED_SCRIPT =
	/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const MARK = /\p{M}/u;
const SPACE = /\s/u;
const MAX_HELD_CHARS = 32;

function isLowSurrogate(code: number): boolean {
	return code >= 0xdc00 && code <= 0xdfff;
}

function charAt(text: string, index: number): string {
	return String.fromCodePoint(text.codePointAt(index) ?? 0);
}

function charBefore(text: string, index: number): string {
	const pair = index >= 2 && isLowSurrogate(text.charCodeAt(index - 1));
	return charAt(text, pair ? index - 2 : index - 1);
}

function isBoundary(text: string, index: number): boolean {
	if (index <= 0) return true;
	if (index < text.length) {
		const after = charAt(text, index);
		if (isLowSurrogate(text.charCodeAt(index)) || MARK.test(after)) {
			return false;
		}
		if (SPACE.test(after) || UNSPACED_SCRIPT.test(after)) return true;
	}
	const before = charBefore(text, index);
	return SPACE.test(before) || UNSPACED_SCRIPT.test(before);
}

/** Cuts at the end of the word `at` falls in; a partial last word waits while streaming. */
export function revealEnd(
	text: string,
	at: number,
	streaming: boolean,
): number {
	for (let index = Math.max(1, Math.ceil(at)); index < text.length; index++) {
		if (isBoundary(text, index)) return index;
	}
	if (!streaming) return text.length;
	for (let end = text.length; end > text.length - MAX_HELD_CHARS; end--) {
		if (end <= 0 || isBoundary(text, end)) return Math.max(end, 0);
	}
	return text.length;
}
