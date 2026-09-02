import { describe, expect, test } from "bun:test";
import { createModeTracker } from "./terminal-mode-tracker";

const enc = new TextEncoder();
const dec = new TextDecoder();

function preambleString(tracker: ReturnType<typeof createModeTracker>): string {
	const bytes = tracker.buildPreamble();
	return bytes ? dec.decode(bytes) : "";
}

/**
 * The full sync emitted when every tracked mode is at its default. The
 * preamble asserts modes in both directions (the attaching xterm may hold
 * non-default state from a restored snapshot), so defaults are explicit
 * disables — except DECOM (`?6`, homes the cursor) and synchronized output
 * (`?2026h` would suspend rendering), which are asymmetric by design.
 */
const DEFAULT_SYNC =
	"\x1b[?1l\x1b[?66l\x1b[?2004l\x1b[4l\x1b[?45l\x1b[?1004l" +
	"\x1b[?25h\x1b[?7h\x1b[?2026l\x1b[?1003l\x1b[?1006l\x1b[=0;1u";

describe("createModeTracker", () => {
	test("default state emits the full both-directions sync", () => {
		const t = createModeTracker(120, 32);
		expect(preambleString(t)).toBe(DEFAULT_SYNC);
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

		expect(preambleString(t)).toContain("\x1b[=7;1u");
		t.dispose();
	});

	test("preamble disarms kitty after explicit pop", () => {
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[>7u"));
		expect(preambleString(t)).toContain("\x1b[=7;1u");

		t.feed(enc.encode("\x1b[<u"));
		expect(preambleString(t)).toContain("\x1b[=0;1u");
		expect(preambleString(t)).not.toContain("\x1b[=7;1u");
		t.dispose();
	});

	test("preamble disarms kitty after explicit set-to-zero", () => {
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[>7u"));
		t.feed(enc.encode("\x1b[=0;1u"));
		expect(preambleString(t)).toContain("\x1b[=0;1u");
		expect(preambleString(t)).not.toContain("\x1b[=7;1u");
		t.dispose();
	});

	test("bracketed paste mode is asserted in both directions", () => {
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[?2004h"));
		expect(preambleString(t)).toContain("\x1b[?2004h");
		t.feed(enc.encode("\x1b[?2004l"));
		// Explicit disable, not silence: the attaching xterm may still be
		// armed from before a reattach gap.
		expect(preambleString(t)).toContain("\x1b[?2004l");
		t.dispose();
	});

	test("focus reporting and mouse tracking are captured", () => {
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[?1004h\x1b[?1002h"));
		const preamble = preambleString(t);
		expect(preamble).toContain("\x1b[?1004h");
		expect(preamble).toContain("\x1b[?1002h");
		expect(preamble).not.toContain("\x1b[?1004l");
		expect(preamble).not.toContain("\x1b[?1003l");
		t.dispose();
	});

	test("SGR mouse encoding is asserted in both directions", () => {
		// A rebuilt renderer (persisted SerializeAddon snapshots don't capture
		// ?1006) falls back to legacy X10 reports for a live TUI without this —
		// and the full-fidelity wheel handler refuses to synthesize non-SGR
		// reports.
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[?1002h\x1b[?1006h"));
		expect(preambleString(t)).toContain("\x1b[?1006h");
		t.feed(enc.encode("\x1b[?1006l"));
		expect(preambleString(t)).toContain("\x1b[?1006l");
		t.dispose();
	});

	test("mouse tracking off is an explicit disarm", () => {
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[?1002h"));
		t.feed(enc.encode("\x1b[?1002l"));
		expect(preambleString(t)).toContain("\x1b[?1003l");
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

	test("cursor visibility is asserted in both directions", () => {
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[?25l"));
		expect(preambleString(t)).toContain("\x1b[?25l");
		// A show must be re-asserted too: the attaching xterm may hold a
		// hidden cursor from a restored snapshot or an earlier preamble.
		t.feed(enc.encode("\x1b[?25h"));
		const p = preambleString(t);
		expect(p).toContain("\x1b[?25h");
		expect(p).not.toContain("\x1b[?25l");
		t.dispose();
	});

	test("preamble is a fixpoint: applying it to a fresh peer reproduces it", () => {
		// The property the resync depends on: after a peer consumes the
		// preamble, its mode state equals the tracker's — so a second
		// preamble built from the peer is byte-identical.
		const source = createModeTracker(120, 32);
		source.feed(
			enc.encode("\x1b[?2004h\x1b[?1004h\x1b[?1002h\x1b[?25l\x1b[?1h\x1b[>7u"),
		);
		const peer = createModeTracker(120, 32);
		const preamble = source.buildPreamble();
		if (!preamble) throw new Error("expected a preamble");
		peer.feed(preamble);
		expect(preambleString(peer)).toBe(dec.decode(preamble));
		source.dispose();
		peer.dispose();
	});

	test("default-state preamble does not move the peer's cursor", () => {
		// Guards the DECOM exception: `?6h`/`?6l` home the cursor, so the
		// preamble must never emit `?6l` for a default-state program. A
		// regression here teleports the cursor of every idle terminal on
		// every silent reconnect.
		const source = createModeTracker(120, 32);
		const peer = createModeTracker(120, 32);
		peer.feed(enc.encode("line one\r\nab"));
		const before = peer.cursorPosition();
		expect(before).toEqual({ x: 2, y: 1 });
		const preamble = source.buildPreamble();
		if (!preamble) throw new Error("expected a preamble");
		peer.feed(preamble);
		expect(peer.cursorPosition()).toEqual(before);
		source.dispose();
		peer.dispose();
	});

	test("resize is idempotent and doesn't reset mode state", () => {
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b[>7u"));
		t.resize(80, 24);
		t.resize(80, 24);
		t.resize(160, 50);
		expect(preambleString(t)).toContain("\x1b[=7;1u");
		t.dispose();
	});

	test("escape sequences split across feeds are still parsed", () => {
		const t = createModeTracker(120, 32);
		t.feed(enc.encode("\x1b["));
		t.feed(enc.encode(">7"));
		t.feed(enc.encode("u"));
		expect(preambleString(t)).toContain("\x1b[=7;1u");
		t.dispose();
	});
});

describe("host-side leaked-input-mode reclaim", () => {
	const MARKER = "\x1b]777;superset-shell-ready\x07";
	const flush = () => new Promise<void>((r) => queueMicrotask(r));

	function makeTracker() {
		const disarms: string[] = [];
		const t = createModeTracker(120, 32, {
			onLeakedInputModeDisarm(bytes) {
				disarms.push(dec.decode(bytes));
				// Mirror terminal.ts: deliverOutput feeds the disarm back in.
				t.feed(bytes);
			},
		});
		return { t, disarms };
	}

	test("disarms a dead TUI's modes at the reclaiming shell's prompt", async () => {
		const { t, disarms } = makeTracker();
		t.feed(enc.encode(MARKER)); // session's first prompt
		t.feed(enc.encode("\x1b[?1003h\x1b[?1006h\x1b[?1004h\x1b[>7u")); // TUI arms
		t.feed(enc.encode(MARKER)); // shell reprompts after an unclean kill
		await flush();
		const out = disarms.join("");
		expect(out).toContain("\x1b[?1003l");
		expect(out).toContain("\x1b[?1004l");
		expect(out).toContain("\x1b[=0;1u");
		// The fed-back disarm converges the tracker: the next attach preamble
		// no longer re-arms fresh renderers.
		const preamble = preambleString(t);
		expect(preamble).toContain("\x1b[?1003l");
		expect(preamble).toContain("\x1b[=0;1u");
		t.dispose();
	});

	test("leaves modes armed before the first marker alone (shell-owned)", async () => {
		const { t, disarms } = makeTracker();
		t.feed(enc.encode("\x1b[?1003h")); // armed before any prompt marker
		t.feed(enc.encode(MARKER));
		await flush();
		expect(disarms).toHaveLength(0);
		t.dispose();
	});

	test("does not disarm modes a TUI restored on clean exit", async () => {
		const { t, disarms } = makeTracker();
		t.feed(enc.encode(MARKER));
		t.feed(enc.encode("\x1b[?1003h\x1b[>7u"));
		t.feed(enc.encode("\x1b[?1003l\x1b[<u")); // clean restore
		t.feed(enc.encode(MARKER));
		await flush();
		expect(disarms).toHaveLength(0);
		t.dispose();
	});

	test("a TUI re-arming right after the marker keeps its modes", async () => {
		const { t, disarms } = makeTracker();
		t.feed(enc.encode(MARKER));
		t.feed(enc.encode("\x1b[?1003h"));
		// Marker and re-arm land in the same chunk (fg after ^Z): the deferred
		// flush must see the re-arm and stand down.
		t.feed(enc.encode(`${MARKER}\x1b[?1003h`));
		await flush();
		expect(disarms).toHaveLength(0);
		t.dispose();
	});

	test("ignores urxvt-style OSC 777 payloads", async () => {
		const { t, disarms } = makeTracker();
		t.feed(enc.encode(MARKER));
		t.feed(enc.encode("\x1b[?1003h"));
		t.feed(enc.encode("\x1b]777;notify;title;body\x07"));
		await flush();
		expect(disarms).toHaveLength(0);
		t.dispose();
	});

	test("no callback wiring means no reclaim side effects", async () => {
		const t = createModeTracker(120, 32);
		t.feed(enc.encode(MARKER));
		t.feed(enc.encode("\x1b[?1003h"));
		t.feed(enc.encode(MARKER));
		await flush();
		// Tracker still reports the armed state untouched.
		expect(preambleString(t)).toContain("\x1b[?1003h");
		t.dispose();
	});
});

describe("snapshot behind an alt screen", () => {
	// Why the handoff reads the retained PTY stream instead of this snapshot:
	// the alternate screen keeps no scrollback, so whatever a TUI has already
	// drawn over is unrecoverable from the emulator, however high maxLines is.
	test("cannot see output the alt screen drew over", () => {
		const t = createModeTracker(80, 4);
		t.feed(enc.encode("before-alt-screen\r\n"));
		t.feed(enc.encode("\x1b[?1049h")); // enter alt screen, as a TUI does
		for (let i = 1; i <= 40; i += 1) t.feed(enc.encode(`frame-line-${i}\r\n`));

		const text = t.snapshot(800).text;
		expect(text).not.toContain("before-alt-screen");
		expect(text).not.toContain("frame-line-1\n");
		expect(text).toContain("frame-line-40");
		expect(text.split("\n").length).toBeLessThanOrEqual(4);
		t.dispose();
	});

	test("keeps scrollback while the program stays on the normal screen", () => {
		const t = createModeTracker(80, 4);
		for (let i = 1; i <= 40; i += 1) t.feed(enc.encode(`line-${i}\r\n`));

		const text = t.snapshot(800).text;
		expect(text).toContain("line-1\n");
		expect(text).toContain("line-40");
		t.dispose();
	});
});
