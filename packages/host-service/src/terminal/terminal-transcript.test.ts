import { describe, expect, test } from "bun:test";
import { reconstructTerminalTranscript } from "./terminal-transcript";

const ESC = String.fromCharCode(27);

/** A TUI that repaints a viewport and never emits a newline. */
function repaintingViewport(turns: number, rows: number): string {
	const conversation: string[] = [];
	let stream = `${ESC}[?1049h`;
	for (let turn = 0; turn < turns; turn++) {
		conversation.push(`turn-${turn}: something worth keeping`);
		stream += `${ESC}[H${ESC}[2J`;
		conversation.slice(-rows).forEach((line, i) => {
			stream += `${ESC}[${i + 1};1H${ESC}[K${ESC}[38;5;244m${line}${ESC}[0m`;
		});
	}
	return stream;
}

/** A program that scrolls inside the alternate screen, as `less` does. */
function scrollingAltScreen(lines: number): string {
	let stream = `${ESC}[?1049h`;
	for (let i = 0; i < lines; i++) stream += `${ESC}[mline-${i}\r\n`;
	return stream;
}

const distinct = (text: string, pattern: RegExp) =>
	new Set([...text.matchAll(pattern)].map((m) => m[1])).size;

describe("reconstructTerminalTranscript", () => {
	test("keeps every turn a repainting TUI drew, one row per line", () => {
		const stream = repaintingViewport(400, 24);
		const text = reconstructTerminalTranscript(stream, {
			cols: 80,
			rows: 24,
		});

		expect(distinct(text, /turn-(\d+):/g)).toBe(400);
		// The point of replaying rather than stripping escapes: real lines.
		expect(text.split("\n").length).toBeGreaterThan(300);
		expect(text).not.toContain(ESC);
	});

	test("does not re-emit rows that only scrolled up a line", () => {
		const stream = repaintingViewport(400, 24);
		const text = reconstructTerminalTranscript(stream, {
			cols: 80,
			rows: 24,
		});

		const lines = text.split("\n").filter((l) => l.trim().length > 0);
		// 400 turns through a 24-row window is ~9,600 rows painted; overlap
		// stitching should land near the 400 distinct ones, not the 9,600.
		expect(lines.length).toBeLessThan(600);
	});

	test("recovers scrollback the alternate screen threw away", () => {
		const text = reconstructTerminalTranscript(scrollingAltScreen(300), {
			cols: 80,
			rows: 24,
		});
		// The live screen holds 24 rows; the stream still has all 300.
		expect(distinct(text, /line-(\d+)/g)).toBeGreaterThan(250);
	});

	test("reads a plain scrolling shell unchanged", () => {
		let stream = "";
		for (let i = 0; i < 300; i++) stream += `line-${i}\r\n`;
		const text = reconstructTerminalTranscript(stream, {
			cols: 80,
			rows: 24,
		});
		expect(distinct(text, /line-(\d+)/g)).toBe(300);
	});

	test("keeps wrapped double-width output, which code-unit chunking lost", () => {
		// A CJK line at 80 characters is 160 columns wide, so it wraps to two
		// rendered rows. Chunking on code units let more than a screen scroll
		// between samples, the overlap merge then found nothing to join on, and
		// the middle went missing: 190 of 200 lines survived.
		let stream = `${ESC}[?1049h`;
		for (let i = 0; i < 200; i++) {
			stream += `行${i}-${"テスト".repeat(27)}\r\n`;
		}

		const text = reconstructTerminalTranscript(stream, {
			cols: 120,
			rows: 40,
		});
		expect(distinct(text, /行(\d+)-/g)).toBe(200);
	});

	test("bounds its work on a repaint-heavy stream", () => {
		// Reconstruction is synchronous inside a tRPC query, so a stream that
		// announces a repaint every few bytes must not turn into tens of
		// thousands of viewport reads while the host serves nobody else.
		let stream = `${ESC}[?1049h`;
		let frame = 0;
		while (stream.length < 1_500_000) {
			stream += `${ESC}[H${ESC}[2J`;
			for (let row = 0; row < 40; row++) {
				stream += `${ESC}[${row + 1};1Hrow ${frame}-${row}`;
			}
			frame++;
		}

		const started = performance.now();
		reconstructTerminalTranscript(stream, { cols: 120, rows: 40 });
		expect(performance.now() - started).toBeLessThan(2000);
	});

	test("works on a tail that never contains the alt-screen switch", () => {
		// The retention ring is a tail, so the `?1049h` is usually long evicted.
		// A replay of the tail believes it is on the normal screen, where
		// cursor-addressed repaints overwrite in place and leave nothing.
		const full = repaintingViewport(400, 24);
		const tail = full.slice(-200_000);
		expect(tail).not.toContain(`${ESC}[?1049h`);

		const text = reconstructTerminalTranscript(tail, {
			cols: 80,
			rows: 24,
		});
		expect(distinct(text, /turn-(\d+):/g)).toBeGreaterThan(100);
	});
});
