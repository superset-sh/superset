import { describe, expect, it } from "bun:test";
import { TERMINAL_OPTIONS } from "./config";

// Reproduces #4908 — the terminal config hides xterm's scrollbar by setting
// `showScrollbar: false`. Users on Ubuntu/Wayland (and elsewhere) running
// TUI CLIs (Codex, Claude) see no scrollbar at all, with no obvious way to
// scroll back through output. On macOS the absence is masked by overlay
// scrollbars; on Linux it's visibly missing.
//
// The intended fix is to let xterm render its scrollbar (default behaviour)
// rather than explicitly suppressing it.
describe("TERMINAL_OPTIONS scrollbar (#4908)", () => {
	it("should let the xterm scrollbar render so users can see/scroll history", () => {
		expect(TERMINAL_OPTIONS.scrollbar?.showScrollbar).not.toBe(false);
	});
});
