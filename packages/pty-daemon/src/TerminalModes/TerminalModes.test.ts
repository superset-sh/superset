import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { TerminalModes } from "./TerminalModes.ts";

const require = createRequire(import.meta.url);
const { Terminal } =
	require("@xterm/headless") as typeof import("@xterm/headless");
const enc = new TextEncoder();

describe("TerminalModes", () => {
	test("checkpoint carries modes and unfinished CSI across output eviction", () => {
		const modes = new TerminalModes();
		modes.feed(enc.encode("\x1b[?2004;1004h\x1b[?1002h\x1b[?1006h\x1b[>7u"));
		modes.feed(enc.encode("text\r\n".repeat(200_000)));
		modes.feed(enc.encode("\x1b[?200"));
		const restored = new TerminalModes();
		restored.restore(JSON.parse(JSON.stringify(modes.snapshot())));
		expect(restored.isEnabled(2004)).toBe(true);
		expect(restored.snapshot().keyboard.flags).toBe(7);
		restored.feed(enc.encode("4l"));
		expect(restored.isEnabled(2004)).toBe(false);
		expect(restored.isEnabled(1004)).toBe(true);
		expect(restored.snapshot().mouseMode).toBe(1002);
	});

	test("checkpoints preserve keyboard stacks in both screen buffers", () => {
		const modes = new TerminalModes();
		modes.feed(enc.encode("\x1b[>3u\x1b[>7u\x1b[?1049h\x1b[>5u\x1b[>15u"));
		const restored = new TerminalModes();
		restored.restore(modes.snapshot());
		restored.feed(enc.encode("\x1b[<u"));
		expect(restored.snapshot().keyboard.flags).toBe(5);
		restored.feed(enc.encode("\x1b[?1049l\x1b[<u"));
		expect(restored.snapshot().keyboard.flags).toBe(3);
	});

	test("unfinished strings cannot turn embedded CSI text into modes after handoff", () => {
		for (const opener of ["\x1b]0;", "\x1bPq", "\x1b_", "\x1b^"]) {
			const modes = new TerminalModes();
			modes.feed(enc.encode(opener + "x".repeat(600_000)));
			const restored = new TerminalModes();
			restored.restore(modes.snapshot());
			restored.feed(enc.encode("[?2004h\x1b\\"));
			expect(restored.isEnabled(2004)).toBe(false);
			restored.feed(enc.encode("\x1b[?2004h"));
			expect(restored.isEnabled(2004)).toBe(true);
			expect(JSON.stringify(restored.snapshot()).length).toBeLessThan(2000);
		}
	});

	test("buffers stay bounded under unfinished controls and keyboard pushes", () => {
		const modes = new TerminalModes();
		modes.feed(
			enc.encode(`${"\x1b[>7u".repeat(1000)}\x1b[${"1;".repeat(10_000)}`),
		);
		expect(modes.snapshot().keyboard.mainStack.length).toBe(16);
		expect(JSON.stringify(modes.snapshot()).length).toBeLessThan(2000);
		modes.feed(enc.encode("2004h"));
		expect(modes.isEnabled(2004)).toBe(false);
	});

	test("UTF-8 continuation bytes cannot start a CSI, including across checkpoints", () => {
		const modes = new TerminalModes();
		modes.feed(new Uint8Array([0xe2]));
		const restored = new TerminalModes();
		restored.restore(modes.snapshot());
		restored.feed(new Uint8Array([0x9b, 0x80, ...enc.encode("?2004h")]));
		expect(restored.isEnabled(2004)).toBe(false);
		restored.feed(enc.encode("\u009b?2004h"));
		expect(restored.isEnabled(2004)).toBe(true);
	});

	test("mode transitions agree with pinned xterm, including split controls and resets", () => {
		const term = new Terminal({
			cols: 80,
			rows: 24,
			allowProposedApi: true,
			logLevel: "off",
		});
		const core = (
			term as unknown as {
				_core: {
					_writeBuffer: { writeSync(bytes: Uint8Array): void };
					optionsService: {
						rawOptions: { vtExtensions: { kittyKeyboard: boolean } };
					};
					coreService: { kittyKeyboard: { flags: number } };
				};
			}
		)._core;
		core.optionsService.rawOptions.vtExtensions = { kittyKeyboard: true };
		const modes = new TerminalModes();
		const sequences = [
			"\x1b[?1;66;2004;1004h",
			"\x1b[?1002;1006h",
			"\x1b[?25l",
			"\x1b[4h",
			"\x1b[?6;45h",
			"\x1b[?7l",
			"\x1b[>3u",
			"\x1b[>7u",
			"\x1b[<u",
			"\x1b[=8;2u",
			"\x1b[=2;3u",
			"\x1b[?1049h",
			"\x1b[>5u",
			"\x1b[?1049l",
			"\x1b[?1000h",
			"\x1b[?1003l",
			"\x1b[?2004l",
			"\x1b[!p",
			"\x1b=",
			"\x1b>",
			"\x1bc",
			"\x1b]0;title ?2004h\x07",
			"\x1b[?200\x7f4h",
			"\x1b[?2004\x18h",
			"\x1b[?200é4h",
			"\x1b[?2004h",
			"\x1b[?200😀4l",
		];
		for (const sequence of sequences) {
			for (const byte of enc.encode(sequence)) {
				const chunk = new Uint8Array([byte]);
				modes.feed(chunk);
				core._writeBuffer.writeSync(chunk);
			}
			const native = term.modes;
			for (const [mode, enabled] of [
				[1, native.applicationCursorKeysMode],
				[66, native.applicationKeypadMode],
				[2004, native.bracketedPasteMode],
				[1004, native.sendFocusMode],
				[25, native.showCursor],
				[7, native.wraparoundMode],
				[6, native.originMode],
				[45, native.reverseWraparoundMode],
			] as const)
				expect(modes.isEnabled(mode)).toBe(enabled);
			expect(modes.snapshot().insert).toBe(native.insertMode);
			expect(modes.snapshot().keyboard.flags).toBe(
				core.coreService.kittyKeyboard.flags,
			);
			const names: Record<number, string> = {
				0: "none",
				9: "x10",
				1000: "vt200",
				1002: "drag",
				1003: "any",
			};
			expect(names[modes.snapshot().mouseMode]).toBe(native.mouseTrackingMode);
		}
		term.dispose();
	});

	test("leaked mode reclaim retains shell ownership and pending markers across checkpoints", () => {
		const modes = new TerminalModes();
		const marker = "\x1b]777;superset-shell-ready\x07";
		modes.feed(enc.encode(`${marker}\x1b[?1004h\x1b[>7u`));
		const restored = new TerminalModes();
		restored.restore(modes.snapshot());
		restored.feed(enc.encode(marker));
		const disarm = restored.collectDisarm();
		expect(disarm).not.toBeNull();
		if (disarm) restored.feed(disarm);
		expect(restored.isEnabled(1004)).toBe(false);
		expect(restored.snapshot().keyboard.flags).toBe(0);
	});
});
