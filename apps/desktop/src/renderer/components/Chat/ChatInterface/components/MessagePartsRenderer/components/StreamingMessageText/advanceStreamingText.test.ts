import { describe, expect, test } from "bun:test";
import { advanceStreamingText } from "./advanceStreamingText";

const STREAM_TEXT_CHARS_PER_TICK = 2;

/**
 * Walk the streaming reducer the same way StreamingMessageText.tsx does:
 * start empty and keep advancing `STREAM_TEXT_CHARS_PER_TICK` UTF-16 code
 * units per tick until the displayed text catches up with `target`.
 */
function streamFully(target: string): string[] {
	const frames: string[] = [];
	let previous = "";
	while (previous.length < target.length) {
		previous = advanceStreamingText(
			previous,
			target,
			STREAM_TEXT_CHARS_PER_TICK,
		);
		frames.push(previous);
	}
	return frames;
}

function endsWithLoneHighSurrogate(s: string): boolean {
	if (s.length === 0) return false;
	const last = s.charCodeAt(s.length - 1);
	return last >= 0xd800 && last <= 0xdbff;
}

describe("advanceStreamingText", () => {
	test("never splits surrogate pairs when streaming Japanese supplementary-plane kanji", () => {
		// "あ𩸽の話" - 𩸽 (U+29E3D) is a CJK Extension B kanji encoded as the
		// surrogate pair 𩸽. With one BMP char preceding it, advancing
		// 2 code units lands between the halves and emits a lone surrogate.
		const target = "あ𩸽の話";

		const frames = streamFully(target);

		for (const frame of frames) {
			expect(endsWithLoneHighSurrogate(frame)).toBe(false);
		}
		expect(frames.at(-1)).toBe(target);
	});

	test("never splits surrogate pairs when streaming emoji", () => {
		// 🍣 (U+1F363) is a single user-perceived character encoded as a
		// surrogate pair. Sliced mid-pair, it renders as garbled text.
		const target = "a🍣b";

		const frames = streamFully(target);

		for (const frame of frames) {
			expect(endsWithLoneHighSurrogate(frame)).toBe(false);
		}
		expect(frames.at(-1)).toBe(target);
	});

	test("returns previous unchanged once the target is fully displayed", () => {
		expect(advanceStreamingText("hello", "hello", 2)).toBe("hello");
	});
});
