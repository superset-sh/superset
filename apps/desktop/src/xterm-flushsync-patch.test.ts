import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Terminal } from "@xterm/xterm";

// Guards the bun patch on @xterm/xterm (SUPER-2120 / DESKTOP-12J, see
// patches/README.md). Unpatched, resize() drains the write queue through
// flushSync(), which drops the promise an async parser handler returns and
// re-enters the paused parser without its continuation token; the parser
// marks itself failed and every later write throws — the pane goes dead while
// the program keeps running. patchedDependencies is keyed to an exact version,
// so a bump silently drops the patch while everything still builds. If this
// fails after a bump, regenerate the patch per patches/README.md; do NOT
// delete the test.

// Stand-in for @xterm/addon-image's inline-image handlers, which hand the
// parser a promise while the image decodes.
const IMAGE = "\x1b]1337;File=inline=1:AAAA\x07";

// xterm parses on a macrotask; an async handler resumes on a microtask once
// its promise settles.
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

function createTerminal() {
	const terminal = new Terminal({ cols: 40, rows: 10 });
	const decoders: Array<(handled: boolean) => void> = [];
	terminal.parser.registerOscHandler(
		1337,
		() => new Promise<boolean>((resolve) => decoders.push(resolve)),
	);
	return {
		terminal,
		finishDecoding() {
			for (const resolve of decoders.splice(0)) resolve(true);
		},
	};
}

function row(terminal: Terminal, index: number): string {
	return terminal.buffer.active.getLine(index)?.translateToString(true) ?? "";
}

describe("@xterm/xterm flushSync patch", () => {
	const libDir = dirname(require.resolve("@xterm/xterm"));
	for (const name of ["xterm.js", "xterm.mjs"] as const) {
		test(`${name} carries the patch`, () => {
			const src = readFileSync(join(libDir, name), "utf8");
			// One definition plus its two call sites (_innerWrite and flushSync).
			expect(src.split("_resumeAfterAsync(").length - 1).toBe(3);
			expect(src).toContain("this._asyncPending=!1");
		});
	}

	test("a resize between an image chunk and the next leaves the parser healthy", async () => {
		const { terminal, finishDecoding } = createTerminal();
		const callbacks: string[] = [];
		terminal.write(`${IMAGE}after`, () => callbacks.push("image"));
		terminal.write("second", () => callbacks.push("second"));

		// Unpatched this throws "improper continuation due to previous async
		// handler, giving up parsing" and the terminal never renders again.
		expect(() => terminal.resize(39, 10)).not.toThrow();
		expect(terminal.cols).toBe(39);
		expect(callbacks).toEqual([]);

		finishDecoding();
		await tick();
		expect(callbacks).toEqual(["image", "second"]);
		expect(row(terminal, 0)).toBe("aftersecond");

		let parsed = false;
		terminal.write("third", () => {
			parsed = true;
		});
		await tick();
		expect(parsed).toBe(true);
		expect(row(terminal, 0)).toBe("aftersecondthird");
	});

	test("a resize while the parser is already paused waits for the handler", async () => {
		const { terminal, finishDecoding } = createTerminal();
		const callbacks: string[] = [];
		terminal.write(IMAGE, () => callbacks.push("image"));
		await tick();
		terminal.write("second", () => callbacks.push("second"));

		expect(() => terminal.resize(39, 10)).not.toThrow();
		expect(callbacks).toEqual([]);

		finishDecoding();
		await tick();
		expect(callbacks).toEqual(["image", "second"]);
		expect(row(terminal, 0)).toBe("second");
	});

	test("flushSync applies queued chunks synchronously when nothing is paused", () => {
		const { terminal } = createTerminal();
		let parsed = false;
		terminal.write("sync", () => {
			parsed = true;
		});
		terminal.resize(39, 10);
		expect(parsed).toBe(true);
		expect(row(terminal, 0)).toBe("sync");
	});
});
