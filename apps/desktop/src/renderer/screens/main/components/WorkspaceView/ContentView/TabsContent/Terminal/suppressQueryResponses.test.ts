/**
 * Verifies the renderer-side suppressors keep terminal queries from generating
 * `onData` replies that would round-trip back to the PTY and echo as visible
 * text at interactive prompts.
 *
 * Uses `@xterm/headless` (same parser as `@xterm/xterm`) because it runs under
 * bun without a DOM.
 */

// xterm env polyfill comes from bunfig.toml `preload`.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";

import { suppressQueryResponses } from "./suppressQueryResponses";

const { Terminal } = await import("@xterm/headless");

const ESC = "\x1b";
const CSI = `${ESC}[`;
const OSC = `${ESC}]`;
const BEL = "\x07";

type Disposer = () => void;

interface Harness {
	terminal: InstanceType<typeof Terminal>;
	cleanup: Disposer;
	captured: string[];
}

function setup(): Harness {
	const terminal = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
	const captured: string[] = [];
	terminal.onData((data) => captured.push(data));
	// suppressQueryResponses takes `@xterm/xterm` Terminal but only touches
	// `.parser`, which is shape-compatible with `@xterm/headless`.
	const cleanup = suppressQueryResponses(terminal as unknown as XTerm);
	return { terminal, cleanup, captured };
}

async function write(
	terminal: InstanceType<typeof Terminal>,
	data: string,
): Promise<void> {
	await new Promise<void>((resolve) => terminal.write(data, () => resolve()));
}

describe("suppressQueryResponses", () => {
	let harness: Harness;

	beforeEach(() => {
		harness = setup();
	});

	afterEach(() => {
		harness.cleanup();
		harness.terminal.dispose();
	});

	describe("Device Attributes (DA)", () => {
		test("suppresses DA1 query response (CSI c)", async () => {
			await write(harness.terminal, `${CSI}c`);
			expect(harness.captured).toEqual([]);
		});

		test("suppresses DA1 query response (CSI 0c)", async () => {
			await write(harness.terminal, `${CSI}0c`);
			expect(harness.captured).toEqual([]);
		});

		test("suppresses DA2 query response (CSI > c)", async () => {
			await write(harness.terminal, `${CSI}>c`);
			expect(harness.captured).toEqual([]);
		});
	});

	describe("OSC color queries", () => {
		test("suppresses OSC 10 fg color query", async () => {
			await write(harness.terminal, `${OSC}10;?${BEL}`);
			expect(harness.captured).toEqual([]);
		});

		test("suppresses OSC 11 bg color query", async () => {
			await write(harness.terminal, `${OSC}11;?${BEL}`);
			expect(harness.captured).toEqual([]);
		});

		test("suppresses OSC 12 cursor color query", async () => {
			await write(harness.terminal, `${OSC}12;?${BEL}`);
			expect(harness.captured).toEqual([]);
		});

		test("does NOT suppress OSC 11 set command", async () => {
			// Set commands have a color spec payload, not '?'. Must still take
			// effect so themes propagate.
			await write(harness.terminal, `${OSC}11;rgb:00/00/00${BEL}`);
			// Set commands themselves don't produce onData; we only assert the
			// handler delegated to xterm's default (no replies, no errors).
			expect(harness.captured).toEqual([]);
		});
	});

	describe("response-only sequences", () => {
		test("suppresses focus-in report (CSI I)", async () => {
			await write(harness.terminal, `${CSI}I`);
			expect(harness.captured).toEqual([]);
		});

		test("suppresses focus-out report (CSI O)", async () => {
			await write(harness.terminal, `${CSI}O`);
			expect(harness.captured).toEqual([]);
		});

		test("suppresses cursor position report response (CSI ; R)", async () => {
			// Renderer should not re-emit a stray CPR response.
			await write(harness.terminal, `${CSI}24;1R`);
			expect(harness.captured).toEqual([]);
		});

		test("suppresses DECRPM mode report response (CSI ? Pm $ y)", async () => {
			await write(harness.terminal, `${CSI}?2004;1$y`);
			expect(harness.captured).toEqual([]);
		});
	});

	describe("queries that must still be answered", () => {
		test("DSR cursor position query (CSI 6n) still emits a CPR reply", async () => {
			// We deliberately do NOT suppress DSR; only the daemon's headless
			// emulator answers DA/OSC color but DSR is fine to answer from
			// either side. This guards against accidentally widening the
			// suppression to all CSI sequences.
			await write(harness.terminal, `${CSI}6n`);
			expect(harness.captured.length).toBeGreaterThan(0);
			expect(harness.captured.join("")).toMatch(
				new RegExp(`^${ESC}\\[\\d+;\\d+R$`),
			);
		});
	});

	describe("cleanup", () => {
		test("disposing un-suppresses queries", async () => {
			harness.cleanup();
			await write(harness.terminal, `${CSI}c`);
			// Default DA1 handler should now answer.
			expect(harness.captured.join("")).toMatch(new RegExp(`^${ESC}\\[\\?\\d`));
		});
	});
});
