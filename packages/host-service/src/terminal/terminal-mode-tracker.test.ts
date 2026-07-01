import { describe, expect, test } from "bun:test";
import { createModeTracker } from "./terminal-mode-tracker";

const enc = new TextEncoder();
const dec = new TextDecoder();

function preambleString(tracker: ReturnType<typeof createModeTracker>): string {
	const bytes = tracker.buildPreamble();
	return bytes ? dec.decode(bytes) : "";
}

describe("createModeTracker", () => {
	test("default state needs no preamble", () => {
		const t = createModeTracker(120, 32);
		expect(t.buildPreamble()).toBeNull();
		t.dispose();
	});

	test("kitty keyboard push survives many KB of unrelated output", () => {
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[>7u"));

		// 200 KB of filler — well past the host-service FIFO's 64 KiB cap.
		// Tracker state is independent of the FIFO so flags should hold.
		const filler = "x".repeat(2048);
		for (let i = 0; i < 100; i += 1) {
			t.feed(enc.encode(filler));
		}

		expect(preambleString(t)).toBe("\x1b[=7;1u");
		t.dispose();
	});

	test("preamble drops kitty after explicit pop", () => {
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[>7u"));
		expect(preambleString(t)).toBe("\x1b[=7;1u");

		t.feed(enc.encode("\x1b[<u"));
		expect(t.buildPreamble()).toBeNull();
		t.dispose();
	});

	test("preamble drops kitty after explicit set-to-zero", () => {
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[>7u"));
		t.feed(enc.encode("\x1b[=0;1u"));
		expect(t.buildPreamble()).toBeNull();
		t.dispose();
	});

	test("bracketed paste mode is captured", () => {
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[?2004h"));
		expect(preambleString(t)).toContain("\x1b[?2004h");
		t.feed(enc.encode("\x1b[?2004l"));
		expect(preambleString(t)).not.toContain("?2004");
		t.dispose();
	});

	test("focus reporting and mouse tracking are captured", () => {
		// `?1002h` is button-tracking; SGR encoding (`?1006h`) is tracked
		// separately via the mouse state service (see #5038 tests below). Here
		// the program never opts into SGR, so the encoding stays X10 and only
		// the tracking + focus modes are restored.
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[?1004h\x1b[?1002h"));
		const preamble = preambleString(t);
		expect(preamble).toContain("\x1b[?1004h");
		expect(preamble).toContain("\x1b[?1002h");
		expect(preamble).not.toContain("?1006");
		t.dispose();
	});

	test("multi-mode preamble lists DEC modes before kitty", () => {
		// Order matters: a peer applying the preamble should see DEC modes
		// settle before the kitty Set, so a kitty-aware program reading back
		// state via `\x1b[?u` query gets a consistent answer.
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[?2004h\x1b[?1004h\x1b[>7u"));
		const p = preambleString(t);
		expect(p.indexOf("\x1b[?2004h")).toBeGreaterThanOrEqual(0);
		expect(p.indexOf("\x1b[?1004h")).toBeGreaterThanOrEqual(0);
		expect(p.indexOf("\x1b[=7;1u")).toBeGreaterThan(p.indexOf("\x1b[?2004h"));
		t.dispose();
	});

	test("show-cursor only emitted when explicitly hidden", () => {
		const t = createModeTracker(120, 32);
		expect(t.buildPreamble()).toBeNull();
		t.feed(enc.encode("\x1b[?25l"));
		expect(preambleString(t)).toContain("\x1b[?25l");
		t.dispose();
	});

	test("resize is idempotent and doesn't reset mode state", () => {
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[>7u"));
		t.resize(80, 24);
		t.resize(80, 24);
		t.resize(160, 50);
		expect(preambleString(t)).toBe("\x1b[=7;1u");
		t.dispose();
	});

	test("escape sequences split across feeds are still parsed", () => {
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b["));
		t.feed(enc.encode(">7"));
		t.feed(enc.encode("u"));
		expect(preambleString(t)).toBe("\x1b[=7;1u");
		t.dispose();
	});

	// Reproduces #5038: a background-adopted alt-screen TUI (opencode, Codex,
	// vim) loses mouse-wheel scrolling. Those programs enter the alternate
	// screen and request SGR mouse reporting ONCE at startup; on a background
	// session the FIFO replay evicts those bytes, so a reattaching renderer
	// must rebuild them from the preamble. Without them the fresh xterm sits in
	// the normal buffer with default (X10) mouse encoding and the wheel either
	// scrolls empty scrollback (frozen) or the app misreads the X10 bytes.
	describe("alt-screen TUI reattach (#5038)", () => {
		test("alternate screen buffer is restored", () => {
			const t = createModeTracker(120, 32);
			t.feed(enc.encode("\x1b[?1049h"));
			expect(preambleString(t)).toContain("\x1b[?1049h");
			t.feed(enc.encode("\x1b[?1049l"));
			expect(preambleString(t)).not.toContain("?1049");
			t.dispose();
		});

		test("SGR mouse encoding is restored alongside tracking", () => {
			const t = createModeTracker(120, 32);
			t.feed(enc.encode("\x1b[?1002h\x1b[?1006h"));
			const p = preambleString(t);
			expect(p).toContain("\x1b[?1002h");
			expect(p).toContain("\x1b[?1006h");
			t.dispose();
		});

		test("full opencode/Codex startup is reconstructed after eviction", () => {
			const t = createModeTracker(120, 32);
			// Alt screen + button-tracking + SGR encoding, as a real TUI emits.
			t.feed(enc.encode("\x1b[?1049h\x1b[?1002h\x1b[?1006h"));
			// Megabytes of redraw frames — well past the 64 KiB FIFO cap.
			const frame = "x".repeat(4096);
			for (let i = 0; i < 256; i += 1) t.feed(enc.encode(frame));
			const p = preambleString(t);
			expect(p).toContain("\x1b[?1049h");
			expect(p).toContain("\x1b[?1002h");
			expect(p).toContain("\x1b[?1006h");
			t.dispose();
		});
	});
});
