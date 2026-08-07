/**
 * Verifies the renderer-side suppressors keep terminal queries from
 * generating replies. In v1 the terminal-host daemon's headless emulator is
 * the canonical answerer; a renderer reply round-trips back to PTY stdin
 * ~20-40ms late and lands in whatever program is reading stdin — go-survey
 * CLIs abort with "unexpected escape sequence from terminal: ['\x1b' ']']"
 * (#3499).
 *
 * Uses `@xterm/headless` (same parser as `@xterm/xterm`; window polyfill
 * comes from the `apps/desktop/bunfig.toml` test preload). Headless answers
 * DA/DSR itself, so those are asserted via `onData`. OSC 10/11/12 and
 * `CSI ?996n` replies are produced by browser-side theme handlers that do
 * not exist in headless, so those are asserted via the handler chain: a
 * probe handler registered BEFORE the suppressors stands in for xterm's
 * earlier-registered built-in handler (most recently registered runs first;
 * `false` falls through). Suppressed = probe never reached.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";

import { suppressQueryResponses } from "./suppressQueryResponses";

const { Terminal } = await import("@xterm/headless");

const ESC = "\x1b";
const CSI = `${ESC}[`;
const OSC = `${ESC}]`;
const BEL = "\x07";

type Headless = InstanceType<typeof Terminal>;

function makeTerminal(): { terminal: Headless; captured: string[] } {
	const terminal = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
	const captured: string[] = [];
	terminal.onData((data) => captured.push(data));
	return { terminal, captured };
}

function install(terminal: Headless): () => void {
	// suppressQueryResponses takes `@xterm/xterm` Terminal but only touches
	// `.parser`, which is shape-compatible with `@xterm/headless`.
	return suppressQueryResponses(terminal as unknown as XTerm);
}

async function write(terminal: Headless, data: string): Promise<void> {
	await new Promise<void>((resolve) => terminal.write(data, () => resolve()));
}

describe("suppressQueryResponses", () => {
	describe("queries headless answers itself (asserted via onData)", () => {
		let terminal: Headless;
		let captured: string[];
		let cleanup: () => void;

		beforeEach(() => {
			({ terminal, captured } = makeTerminal());
			cleanup = install(terminal);
		});

		afterEach(() => {
			cleanup();
			terminal.dispose();
		});

		test.each([
			["DA1 `CSI c`", `${CSI}c`],
			["DA1 `CSI 0c`", `${CSI}0c`],
			["DA2 `CSI > c`", `${CSI}>c`],
			["DSR status `CSI 5n`", `${CSI}5n`],
			["DSR cursor `CSI 6n`", `${CSI}6n`],
			["DECXCPR `CSI ? 6 n`", `${CSI}?6n`],
		])("%s emits no reply", async (_name, sequence) => {
			await write(terminal, sequence);
			expect(captured).toEqual([]);
		});

		test("disposing restores xterm's default DA1 auto-reply", async () => {
			cleanup();
			// Re-arm cleanup with a no-op so afterEach stays valid.
			cleanup = () => {};
			await write(terminal, `${CSI}c`);
			expect(captured.join("")).toMatch(new RegExp(`^${ESC}\\[\\?\\d`));
		});
	});

	describe("handler-chain contract (probe = xterm's built-in handler)", () => {
		let terminal: Headless;
		let cleanup: () => void;

		afterEach(() => {
			cleanup();
			terminal.dispose();
		});

		function setupOscProbe(code: number): { calls: string[] } {
			({ terminal } = makeTerminal());
			const calls: string[] = [];
			terminal.parser.registerOscHandler(code, (data) => {
				calls.push(data);
				return false;
			});
			cleanup = install(terminal);
			return { calls };
		}

		test.each([
			[10],
			[11],
			[12],
		])("OSC %i `?` query never reaches the built-in handler", async (code) => {
			const { calls } = setupOscProbe(code);
			await write(terminal, `${OSC}${code};?${BEL}`);
			expect(calls).toEqual([]);
		});

		test("OSC 11 `?` query with ST terminator is also suppressed", async () => {
			const { calls } = setupOscProbe(11);
			await write(terminal, `${OSC}11;?${ESC}\\`);
			expect(calls).toEqual([]);
		});

		test("OSC 11 mixed stacked payload `?;rgb:...` is suppressed", async () => {
			const { calls } = setupOscProbe(11);
			await write(terminal, `${OSC}11;?;rgb:00/00/00${BEL}`);
			expect(calls).toEqual([]);
		});

		test("OSC 11 set command falls through to the built-in handler", async () => {
			const { calls } = setupOscProbe(11);
			await write(terminal, `${OSC}11;rgb:00/00/00${BEL}`);
			expect(calls).toEqual(["rgb:00/00/00"]);
		});

		function setupCsiProbe(id: { prefix?: string; final: string }): {
			calls: (number | number[])[][];
		} {
			({ terminal } = makeTerminal());
			const calls: (number | number[])[][] = [];
			terminal.parser.registerCsiHandler(id, (params) => {
				calls.push([...params]);
				return false;
			});
			cleanup = install(terminal);
			return { calls };
		}

		test("`CSI ?996n` (color-scheme query) falls through — renderer must keep answering it", async () => {
			const { calls } = setupCsiProbe({ prefix: "?", final: "n" });
			await write(terminal, `${CSI}?996n`);
			expect(calls).toEqual([[996]]);
		});

		test("`CSI ?6n` (DECXCPR) does not fall through", async () => {
			const { calls } = setupCsiProbe({ prefix: "?", final: "n" });
			await write(terminal, `${CSI}?6n`);
			expect(calls).toEqual([]);
		});

		test("`CSI 0n` (DSR param outside 5/6) falls through", async () => {
			const { calls } = setupCsiProbe({ final: "n" });
			await write(terminal, `${CSI}0n`);
			expect(calls).toEqual([[0]]);
		});
	});
});
