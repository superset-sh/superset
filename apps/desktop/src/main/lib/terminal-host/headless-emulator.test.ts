/**
 * Headless Terminal Round-Trip Test
 *
 * This test proves that we can:
 * 1. Feed terminal output into a headless emulator
 * 2. Capture mode state changes (application cursor keys, bracketed paste, mouse tracking)
 * 3. Serialize the terminal state
 * 4. Apply that state to a fresh emulator
 * 5. Verify the restored terminal has matching visual content and mode flags
 *
 * This is the foundational proof for "perfect resume" - the ability to restore
 * terminal sessions across app restarts.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { INPUT_MODE_DISARM_SEQUENCE } from "shared/terminal-input-modes";
import { DEFAULT_MODES } from "./types";

if (typeof window === "undefined") {
	(globalThis as Record<string, unknown>).window = globalThis;
}

const { HeadlessEmulator, modesEqual } = await import("./headless-emulator");

// Escape sequences for testing
const ESC = "\x1b";
const CSI = `${ESC}[`;
const OSC = `${ESC}]`;
const BEL = "\x07";

// Mode enable/disable sequences
const ENABLE_APP_CURSOR = `${CSI}?1h`;
const DISABLE_APP_CURSOR = `${CSI}?1l`;
const ENABLE_BRACKETED_PASTE = `${CSI}?2004h`;
const DISABLE_BRACKETED_PASTE = `${CSI}?2004l`;
const ENABLE_MOUSE_SGR = `${CSI}?1006h`;
const DISABLE_MOUSE_SGR = `${CSI}?1006l`;
const ENABLE_MOUSE_NORMAL = `${CSI}?1000h`;
const DISABLE_MOUSE_NORMAL = `${CSI}?1000l`;
const ENABLE_FOCUS_REPORTING = `${CSI}?1004h`;
const HIDE_CURSOR = `${CSI}?25l`;
const SHOW_CURSOR = `${CSI}?25h`;
const ENTER_ALT_SCREEN = `${CSI}?1049h`;
const EXIT_ALT_SCREEN = `${CSI}?1049l`;

// Cursor movement
const MOVE_CURSOR = (row: number, col: number) => `${CSI}${row};${col}H`;
const CLEAR_SCREEN = `${CSI}2J`;

// OSC-7 CWD reporting - format is file://hostname/path (path is NOT URL-encoded)
const OSC7_CWD = (path: string) => `${OSC}7;file://localhost${path}${BEL}`;

describe("HeadlessEmulator", () => {
	let emulator: InstanceType<typeof HeadlessEmulator>;

	beforeEach(() => {
		emulator = new HeadlessEmulator({ cols: 80, rows: 24, scrollback: 1000 });
	});

	afterEach(() => {
		emulator.dispose();
	});

	describe("basic functionality", () => {
		test("should initialize with default modes", () => {
			const modes = emulator.getModes();
			expect(modesEqual(modes, DEFAULT_MODES)).toBe(true);
		});

		test("should write text to terminal", async () => {
			await emulator.writeSync("Hello, World!\r\n");
			const snapshot = emulator.getSnapshot();
			expect(snapshot.snapshotAnsi).toContain("Hello, World!");
		});

		test("should track dimensions", () => {
			const dims = emulator.getDimensions();
			expect(dims.cols).toBe(80);
			expect(dims.rows).toBe(24);
		});

		test("should resize terminal", () => {
			emulator.resize(120, 40);
			const dims = emulator.getDimensions();
			expect(dims.cols).toBe(120);
			expect(dims.rows).toBe(40);
		});
	});

	describe("mode tracking", () => {
		test("should track application cursor keys mode", async () => {
			expect(emulator.getModes().applicationCursorKeys).toBe(false);

			await emulator.writeSync(ENABLE_APP_CURSOR);
			expect(emulator.getModes().applicationCursorKeys).toBe(true);

			await emulator.writeSync(DISABLE_APP_CURSOR);
			expect(emulator.getModes().applicationCursorKeys).toBe(false);
		});

		test("should track bracketed paste mode", async () => {
			expect(emulator.getModes().bracketedPaste).toBe(false);

			await emulator.writeSync(ENABLE_BRACKETED_PASTE);
			expect(emulator.getModes().bracketedPaste).toBe(true);

			await emulator.writeSync(DISABLE_BRACKETED_PASTE);
			expect(emulator.getModes().bracketedPaste).toBe(false);
		});

		test("should track mouse SGR mode", async () => {
			expect(emulator.getModes().mouseSgr).toBe(false);

			await emulator.writeSync(ENABLE_MOUSE_SGR);
			expect(emulator.getModes().mouseSgr).toBe(true);

			await emulator.writeSync(DISABLE_MOUSE_SGR);
			expect(emulator.getModes().mouseSgr).toBe(false);
		});

		test("should track mouse normal tracking mode", async () => {
			expect(emulator.getModes().mouseTrackingNormal).toBe(false);

			await emulator.writeSync(ENABLE_MOUSE_NORMAL);
			expect(emulator.getModes().mouseTrackingNormal).toBe(true);

			await emulator.writeSync(DISABLE_MOUSE_NORMAL);
			expect(emulator.getModes().mouseTrackingNormal).toBe(false);
		});

		test("should track focus reporting mode", async () => {
			expect(emulator.getModes().focusReporting).toBe(false);

			await emulator.writeSync(ENABLE_FOCUS_REPORTING);
			expect(emulator.getModes().focusReporting).toBe(true);
		});

		test("should track cursor visibility", async () => {
			expect(emulator.getModes().cursorVisible).toBe(true); // Default is visible

			await emulator.writeSync(HIDE_CURSOR);
			expect(emulator.getModes().cursorVisible).toBe(false);

			await emulator.writeSync(SHOW_CURSOR);
			expect(emulator.getModes().cursorVisible).toBe(true);
		});

		test("should track alternate screen mode", async () => {
			expect(emulator.getModes().alternateScreen).toBe(false);

			await emulator.writeSync(ENTER_ALT_SCREEN);
			expect(emulator.getModes().alternateScreen).toBe(true);

			await emulator.writeSync(EXIT_ALT_SCREEN);
			expect(emulator.getModes().alternateScreen).toBe(false);
		});

		test("should handle multiple modes in single sequence", async () => {
			// Enable both app cursor and bracketed paste in one sequence
			await emulator.writeSync(`${CSI}?1;2004h`);

			const modes = emulator.getModes();
			expect(modes.applicationCursorKeys).toBe(true);
			expect(modes.bracketedPaste).toBe(true);
		});
	});

	describe("CWD tracking via OSC-7", () => {
		test("should parse OSC-7 with BEL terminator", async () => {
			expect(emulator.getCwd()).toBeNull();

			await emulator.writeSync(OSC7_CWD("/Users/test/project"));
			expect(emulator.getCwd()).toBe("/Users/test/project");
		});

		test("should update CWD on directory change", async () => {
			await emulator.writeSync(OSC7_CWD("/Users/test"));
			expect(emulator.getCwd()).toBe("/Users/test");

			await emulator.writeSync(OSC7_CWD("/Users/test/subdir"));
			expect(emulator.getCwd()).toBe("/Users/test/subdir");
		});

		test("should handle paths with spaces", async () => {
			await emulator.writeSync(OSC7_CWD("/Users/test/my project"));
			expect(emulator.getCwd()).toBe("/Users/test/my project");
		});
	});

	describe("snapshot generation", () => {
		test("should generate snapshot with screen content", async () => {
			await emulator.writeSync("Line 1\r\nLine 2\r\nLine 3\r\n");

			const snapshot = emulator.getSnapshot();

			expect(snapshot.snapshotAnsi).toBeDefined();
			expect(snapshot.snapshotAnsi.length).toBeGreaterThan(0);
			expect(snapshot.cols).toBe(80);
			expect(snapshot.rows).toBe(24);
		});

		test("should include mode state in snapshot", async () => {
			await emulator.writeSync(ENABLE_APP_CURSOR);
			await emulator.writeSync(ENABLE_BRACKETED_PASTE);
			await emulator.writeSync(ENABLE_MOUSE_SGR);

			const snapshot = emulator.getSnapshot();

			expect(snapshot.modes.applicationCursorKeys).toBe(true);
			expect(snapshot.modes.bracketedPaste).toBe(true);
			expect(snapshot.modes.mouseSgr).toBe(true);
		});

		test("should include CWD in snapshot", async () => {
			await emulator.writeSync(OSC7_CWD("/home/user/workspace"));

			const snapshot = emulator.getSnapshot();

			expect(snapshot.cwd).toBe("/home/user/workspace");
		});

		test("should generate rehydrate sequences for non-default modes", async () => {
			await emulator.writeSync(ENABLE_APP_CURSOR);
			await emulator.writeSync(ENABLE_BRACKETED_PASTE);

			const snapshot = emulator.getSnapshot();

			// Rehydrate sequences should contain mode-setting escapes
			expect(snapshot.rehydrateSequences).toContain("?1h"); // app cursor
			expect(snapshot.rehydrateSequences).toContain("?2004h"); // bracketed paste
		});

		test("should not generate rehydrate sequences for default modes", async () => {
			// Don't change any modes - use defaults
			await emulator.writeSync("Some text\r\n");

			const snapshot = emulator.getSnapshot();

			// Should have empty or minimal rehydrate sequences
			expect(snapshot.rehydrateSequences).toBe("");
		});
	});
});

describe("Snapshot Round-Trip", () => {
	test("should restore simple text content", async () => {
		const source = new HeadlessEmulator({ cols: 80, rows: 24 });
		const target = new HeadlessEmulator({ cols: 80, rows: 24 });

		try {
			// Write content to source
			await source.writeSync("Hello, World!\r\n");
			await source.writeSync("This is line 2\r\n");
			await source.writeSync("And line 3\r\n");

			// Get snapshot and apply to target
			const snapshot = source.getSnapshot();
			await target.writeSync(snapshot.rehydrateSequences);
			await target.writeSync(snapshot.snapshotAnsi);

			// Verify content matches
			const targetSnapshot = target.getSnapshot();
			expect(targetSnapshot.snapshotAnsi).toContain("Hello, World!");
			expect(targetSnapshot.snapshotAnsi).toContain("This is line 2");
			expect(targetSnapshot.snapshotAnsi).toContain("And line 3");
		} finally {
			source.dispose();
			target.dispose();
		}
	});

	test("should restore mode state", async () => {
		const source = new HeadlessEmulator({ cols: 80, rows: 24 });
		const target = new HeadlessEmulator({ cols: 80, rows: 24 });

		try {
			// Set up modes in source
			await source.writeSync(ENABLE_APP_CURSOR);
			await source.writeSync(ENABLE_BRACKETED_PASTE);
			await source.writeSync(ENABLE_MOUSE_NORMAL);
			await source.writeSync(ENABLE_MOUSE_SGR);

			// Get snapshot
			const snapshot = source.getSnapshot();

			// Verify source modes
			expect(snapshot.modes.applicationCursorKeys).toBe(true);
			expect(snapshot.modes.bracketedPaste).toBe(true);
			expect(snapshot.modes.mouseTrackingNormal).toBe(true);
			expect(snapshot.modes.mouseSgr).toBe(true);

			// Apply snapshot to target using applySnapshot helper
			await applySnapshotAsync(target, snapshot);

			// Verify target modes match
			const targetModes = target.getModes();
			expect(targetModes.applicationCursorKeys).toBe(true);
			expect(targetModes.bracketedPaste).toBe(true);
			expect(targetModes.mouseTrackingNormal).toBe(true);
			expect(targetModes.mouseSgr).toBe(true);
		} finally {
			source.dispose();
			target.dispose();
		}
	});

	test("should restore cursor position and screen state", async () => {
		const source = new HeadlessEmulator({ cols: 80, rows: 24 });
		const target = new HeadlessEmulator({ cols: 80, rows: 24 });

		try {
			// Draw a simple screen with cursor at specific position
			await source.writeSync(CLEAR_SCREEN);
			await source.writeSync(MOVE_CURSOR(1, 1));
			await source.writeSync("Top left");
			await source.writeSync(MOVE_CURSOR(12, 40));
			await source.writeSync("Center");
			await source.writeSync(MOVE_CURSOR(24, 70));
			await source.writeSync("Bottom right");

			// Get snapshot and apply
			const snapshot = source.getSnapshot();
			await applySnapshotAsync(target, snapshot);

			// Verify screen content
			const targetSnapshot = target.getSnapshot();
			expect(targetSnapshot.snapshotAnsi).toContain("Top left");
			expect(targetSnapshot.snapshotAnsi).toContain("Center");
			expect(targetSnapshot.snapshotAnsi).toContain("Bottom right");
		} finally {
			source.dispose();
			target.dispose();
		}
	});

	test("should handle TUI-like screen with modes enabled", async () => {
		const source = new HeadlessEmulator({ cols: 80, rows: 24 });
		const target = new HeadlessEmulator({ cols: 80, rows: 24 });

		try {
			// Simulate a TUI application setup (like vim, htop, etc.)
			// Enter alternate screen
			await source.writeSync(ENTER_ALT_SCREEN);
			// Enable application cursor keys
			await source.writeSync(ENABLE_APP_CURSOR);
			// Enable bracketed paste
			await source.writeSync(ENABLE_BRACKETED_PASTE);
			// Enable mouse tracking with SGR encoding
			await source.writeSync(ENABLE_MOUSE_NORMAL);
			await source.writeSync(ENABLE_MOUSE_SGR);
			// Hide cursor
			await source.writeSync(HIDE_CURSOR);
			// Clear and draw
			await source.writeSync(CLEAR_SCREEN);
			await source.writeSync(MOVE_CURSOR(1, 1));
			await source.writeSync("=== TUI Application ===");
			await source.writeSync(MOVE_CURSOR(3, 1));
			await source.writeSync("Press q to quit");
			await source.writeSync(MOVE_CURSOR(24, 1));
			await source.writeSync("[Status Bar]");

			// Get snapshot
			const snapshot = source.getSnapshot();

			// Verify all modes are captured
			expect(snapshot.modes.alternateScreen).toBe(true);
			expect(snapshot.modes.applicationCursorKeys).toBe(true);
			expect(snapshot.modes.bracketedPaste).toBe(true);
			expect(snapshot.modes.mouseTrackingNormal).toBe(true);
			expect(snapshot.modes.mouseSgr).toBe(true);
			expect(snapshot.modes.cursorVisible).toBe(false);

			// Apply to target
			await applySnapshotAsync(target, snapshot);

			// Verify target modes
			const targetModes = target.getModes();
			expect(targetModes.applicationCursorKeys).toBe(true);
			expect(targetModes.bracketedPaste).toBe(true);
			expect(targetModes.mouseTrackingNormal).toBe(true);
			expect(targetModes.mouseSgr).toBe(true);
			expect(targetModes.cursorVisible).toBe(false);

			// Note: alternateScreen mode is handled by the snapshot itself,
			// not by rehydrate sequences (since the serialized content already
			// represents the correct screen buffer)

			// Verify content
			const targetSnapshot = target.getSnapshot();
			expect(targetSnapshot.snapshotAnsi).toContain("TUI Application");
			expect(targetSnapshot.snapshotAnsi).toContain("Press q to quit");
			expect(targetSnapshot.snapshotAnsi).toContain("[Status Bar]");
		} finally {
			source.dispose();
			target.dispose();
		}
	});

	test("should preserve scrollback content", async () => {
		const source = new HeadlessEmulator({
			cols: 80,
			rows: 5,
			scrollback: 100,
		});
		const target = new HeadlessEmulator({
			cols: 80,
			rows: 5,
			scrollback: 100,
		});

		try {
			// Write many lines to create scrollback
			for (let i = 1; i <= 20; i++) {
				await source.writeSync(`Line ${i}\r\n`);
			}

			const snapshot = source.getSnapshot();

			// Verify scrollback is captured
			expect(snapshot.scrollbackLines).toBeGreaterThan(5);

			// Apply to target
			await applySnapshotAsync(target, snapshot);

			// Verify scrollback content is restored
			const targetSnapshot = target.getSnapshot();
			expect(targetSnapshot.snapshotAnsi).toContain("Line 1");
			expect(targetSnapshot.snapshotAnsi).toContain("Line 10");
			expect(targetSnapshot.snapshotAnsi).toContain("Line 20");
		} finally {
			source.dispose();
			target.dispose();
		}
	});
});

describe("Edge Cases", () => {
	test("should handle rapid mode toggling", async () => {
		const emulator = new HeadlessEmulator({ cols: 80, rows: 24 });

		try {
			// Rapidly toggle modes
			for (let i = 0; i < 10; i++) {
				await emulator.writeSync(ENABLE_APP_CURSOR);
				await emulator.writeSync(DISABLE_APP_CURSOR);
				await emulator.writeSync(ENABLE_BRACKETED_PASTE);
				await emulator.writeSync(DISABLE_BRACKETED_PASTE);
			}

			// Should end at default state
			const modes = emulator.getModes();
			expect(modes.applicationCursorKeys).toBe(false);
			expect(modes.bracketedPaste).toBe(false);
		} finally {
			emulator.dispose();
		}
	});

	test("should handle interleaved content and mode changes", async () => {
		const emulator = new HeadlessEmulator({ cols: 80, rows: 24 });

		try {
			await emulator.writeSync("Before modes\r\n");
			await emulator.writeSync(ENABLE_APP_CURSOR);
			await emulator.writeSync("After app cursor\r\n");
			await emulator.writeSync(ENABLE_BRACKETED_PASTE);
			await emulator.writeSync("After bracketed paste\r\n");
			await emulator.writeSync(OSC7_CWD("/test/path"));
			await emulator.writeSync("After CWD\r\n");

			const snapshot = emulator.getSnapshot();

			expect(snapshot.modes.applicationCursorKeys).toBe(true);
			expect(snapshot.modes.bracketedPaste).toBe(true);
			expect(snapshot.cwd).toBe("/test/path");
			expect(snapshot.snapshotAnsi).toContain("Before modes");
			expect(snapshot.snapshotAnsi).toContain("After CWD");
		} finally {
			emulator.dispose();
		}
	});

	test("should handle empty terminal", async () => {
		const emulator = new HeadlessEmulator({ cols: 80, rows: 24 });

		try {
			// Flush to ensure terminal is ready
			await emulator.flush();
			const snapshot = emulator.getSnapshot();

			expect(snapshot.cols).toBe(80);
			expect(snapshot.rows).toBe(24);
			expect(snapshot.cwd).toBeNull();
			expect(modesEqual(snapshot.modes, DEFAULT_MODES)).toBe(true);
		} finally {
			emulator.dispose();
		}
	});

	test("should handle resize during session", async () => {
		const source = new HeadlessEmulator({ cols: 80, rows: 24 });
		const target = new HeadlessEmulator({ cols: 80, rows: 24 });

		try {
			await source.writeSync("Initial content\r\n");
			source.resize(120, 40);
			await source.writeSync("After resize\r\n");

			const snapshot = source.getSnapshot();

			expect(snapshot.cols).toBe(120);
			expect(snapshot.rows).toBe(40);

			// Resize target to match before applying
			target.resize(120, 40);
			await applySnapshotAsync(target, snapshot);

			const targetSnapshot = target.getSnapshot();
			expect(targetSnapshot.snapshotAnsi).toContain("Initial content");
			expect(targetSnapshot.snapshotAnsi).toContain("After resize");
		} finally {
			source.dispose();
			target.dispose();
		}
	});
});

describe("Prompt marker foreground reclaim (#4949 / #5508)", () => {
	// The shell wrappers print both markers before every prompt; OSC 777 is
	// the reclaim trigger (app-private, never stripped by the shell-ready
	// scanner), OSC 133;A feeds shell-ready detection.
	const PROMPT_MARKER = `${OSC}777;superset-shell-ready${BEL}${OSC}133;A${BEL}`;
	const ARM_TUI_MODES = [
		ENABLE_MOUSE_NORMAL,
		`${CSI}?1002h`,
		`${CSI}?1003h`,
		ENABLE_MOUSE_SGR,
		ENABLE_FOCUS_REPORTING,
		ENABLE_BRACKETED_PASTE,
		ENABLE_APP_CURSOR,
	].join("");

	let emulator: InstanceType<typeof HeadlessEmulator>;

	beforeEach(() => {
		emulator = new HeadlessEmulator({ cols: 80, rows: 24 });
	});

	afterEach(() => {
		emulator.dispose();
	});

	test("clears pointer/focus modes when the shell prompts again", async () => {
		await emulator.writeSync(PROMPT_MARKER); // the session's first prompt
		await emulator.writeSync(ARM_TUI_MODES);
		expect(emulator.getModes().mouseTrackingAnyEvent).toBe(true);

		await emulator.writeSync(PROMPT_MARKER);

		const modes = emulator.getModes();
		expect(modes.mouseTrackingNormal).toBe(false);
		expect(modes.mouseTrackingButtonEvent).toBe(false);
		expect(modes.mouseTrackingAnyEvent).toBe(false);
		expect(modes.focusReporting).toBe(false);
		// The SGR encoding is exempt from reclaim: it is inert with no protocol
		// armed, and clearing it would break suspend/fg (the TUI re-arms only
		// its protocol on fg while the terminal still has SGR latched).
		expect(modes.mouseSgr).toBe(true);

		// Both snapshot channels must be clean: rehydrateSequences comes from
		// the shadow map, snapshotAnsi from SerializeAddon reading the live
		// terminal — the renderer writes snapshotAnsi last, so a leak there
		// re-arms the modes on warm reattach (#5508).
		const snapshot = emulator.getSnapshot();
		expect(snapshot.rehydrateSequences).not.toContain("1002");
		expect(snapshot.snapshotAnsi).not.toContain("?1002h");
		expect(snapshot.snapshotAnsi).not.toContain("?1003h");
		expect(snapshot.snapshotAnsi).not.toContain("?1004h");
		// SerializeAddon serializes the mouse tracking level and focus but not
		// the SGR/UTF-8 encoding, so the snapshot can't carry a stale ?1006h
		// either; assert it to guard against a future serialize change.
		expect(snapshot.snapshotAnsi).not.toContain("?1006h");
	});

	test("leaves the shell's own line-editor modes armed across a marker", async () => {
		// A shell (e.g. fish) may arm bracketed paste / app cursor keys before
		// emitting its prompt marker. The marker reset must not clear those, or
		// a warm reattach would drop a live shell's own paste handling (#5508).
		await emulator.writeSync(`${ENABLE_BRACKETED_PASTE}${ENABLE_APP_CURSOR}`);

		await emulator.writeSync(PROMPT_MARKER);

		const modes = emulator.getModes();
		expect(modes.bracketedPaste).toBe(true);
		expect(modes.applicationCursorKeys).toBe(true);
		const snapshot = emulator.getSnapshot();
		expect(snapshot.rehydrateSequences).toContain("?2004h");
		expect(snapshot.snapshotAnsi).toContain("?2004h");
	});

	test("exempts modes armed by shell init from reclaim (shell-owned)", async () => {
		// A .zshrc that runs `printf '\e[?1004h'` arms focus reporting before
		// the first prompt marker; the shell owns it and never re-arms it, so
		// a reclaim clearing it would lose it for the session's lifetime.
		await emulator.writeSync(ENABLE_FOCUS_REPORTING);
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(`${CSI}?1002h`); // TUI arms mouse, dies
		await emulator.writeSync(PROMPT_MARKER);

		const modes = emulator.getModes();
		expect(modes.mouseTrackingButtonEvent).toBe(false); // leaked → reclaimed
		expect(modes.focusReporting).toBe(true); // shell-owned → survives
		const snapshot = emulator.getSnapshot();
		expect(snapshot.rehydrateSequences).toContain("?1004h");
		expect(snapshot.snapshotAnsi).toContain("?1004h");
	});

	test("a DECRST releases shell ownership; the next arming is reclaimable", async () => {
		await emulator.writeSync(ENABLE_FOCUS_REPORTING); // shell init arms
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(`${CSI}?1004l`); // owner releases it
		await emulator.writeSync(ENABLE_FOCUS_REPORTING); // TUI arms, dies
		await emulator.writeSync(PROMPT_MARKER);

		expect(emulator.getModes().focusReporting).toBe(false);
	});

	test("keeps display modes across a prompt marker", async () => {
		// Cursor visibility is never reclaimed; the alt screen here was armed
		// before the first marker, so it is shell-owned and survives too (a
		// post-marker alt-screen leak is exited by injection instead — see the
		// buffer-exit suite).
		await emulator.writeSync(`${ENTER_ALT_SCREEN}${HIDE_CURSOR}`);

		await emulator.writeSync(PROMPT_MARKER);

		const modes = emulator.getModes();
		expect(modes.alternateScreen).toBe(true);
		expect(modes.cursorVisible).toBe(false);
	});

	test("keeps modes armed after the marker for a live TUI", async () => {
		// Shell prompt, then the user launches a mouse TUI: reattach must
		// still rehydrate its modes (the arming came after the marker).
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(`${CSI}?1002h${ENABLE_MOUSE_SGR}`);

		const snapshot = emulator.getSnapshot();
		expect(snapshot.modes.mouseTrackingButtonEvent).toBe(true);
		expect(snapshot.modes.mouseSgr).toBe(true);
		expect(snapshot.rehydrateSequences).toContain("?1002h");
		expect(snapshot.rehydrateSequences).toContain("?1006h");
		// The serialized snapshot must keep the live mouse tracking too.
		expect(snapshot.snapshotAnsi).toContain("?1002h");
	});

	test("keeps mouse armed when a live TUI re-arms after the marker in one chunk", async () => {
		// Dead TUI armed drag-mouse, the shell prompted, and a new TUI re-armed
		// any-event mouse — all in one chunk. Resetting any mouse level clears
		// the whole protocol in the terminal, so the disarm must not fire.
		await emulator.writeSync(
			`${PROMPT_MARKER}${CSI}?1002h${PROMPT_MARKER}${CSI}?1003h${ENABLE_MOUSE_SGR}`,
		);

		const snapshot = emulator.getSnapshot();
		expect(snapshot.modes.mouseTrackingAnyEvent).toBe(true);
		expect(snapshot.rehydrateSequences).toContain("?1003h");
		expect(snapshot.snapshotAnsi).toContain("?1003h");
	});

	test("applies marker and mode changes in stream order within one chunk", async () => {
		// TUI armed mouse, died, shell prompted, zle re-armed bracketed paste.
		await emulator.writeSync(
			`${PROMPT_MARKER}${CSI}?1002h${PROMPT_MARKER}$ ${ENABLE_BRACKETED_PASTE}`,
		);

		const modes = emulator.getModes();
		expect(modes.mouseTrackingButtonEvent).toBe(false);
		expect(modes.bracketedPaste).toBe(true);
	});

	test("preserves the mouse encoding across suspend/fg", async () => {
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(`${ENABLE_MOUSE_NORMAL}${ENABLE_MOUSE_SGR}`);
		await emulator.writeSync(PROMPT_MARKER); // ^Z — back at the prompt
		await emulator.writeSync(`${CSI}?1002h`); // fg: TUI re-arms protocol only

		const snapshot = emulator.getSnapshot();
		expect(snapshot.modes.mouseTrackingButtonEvent).toBe(true);
		// The encoding survived the reclaim, so reattach keeps SGR under the
		// re-armed protocol instead of degrading to X10 and garbling clicks.
		expect(snapshot.modes.mouseSgr).toBe(true);
		expect(snapshot.rehydrateSequences).toContain("?1002h");
		expect(snapshot.rehydrateSequences).toContain("?1006h");
	});

	test("reclaims leaked insert/origin/reverse-wrap modes but not the keypad", async () => {
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(`${CSI}4h${CSI}?6h${CSI}?45h${CSI}?66h`);
		await emulator.writeSync(PROMPT_MARKER);

		const modes = emulator.getModes();
		expect(modes.insertMode).toBe(false);
		expect(modes.originMode).toBe(false);
		expect(modes.reverseWraparound).toBe(false);
		const snapshot = emulator.getSnapshot();
		expect(snapshot.snapshotAnsi).not.toContain(`${CSI}4h`);
		expect(snapshot.snapshotAnsi).not.toContain("?6h");
		expect(snapshot.snapshotAnsi).not.toContain("?45h");
		// Application keypad is shell-armed (smkx sends ESC = per line-editor
		// activation), so the reclaim leaves it alone — like DECCKM.
		expect(snapshot.snapshotAnsi).toContain("?66h");
	});

	test("keeps insert/origin/reverse-wrap armed for a live TUI", async () => {
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(`${CSI}4h${CSI}?6h${CSI}?45h`);

		const snapshot = emulator.getSnapshot();
		expect(snapshot.modes.insertMode).toBe(true);
		expect(snapshot.rehydrateSequences).toContain(`${CSI}4h`);
		expect(snapshot.rehydrateSequences).toContain("?6h");
		expect(snapshot.rehydrateSequences).toContain("?45h");
		expect(snapshot.snapshotAnsi).toContain(`${CSI}4h`);
		expect(snapshot.snapshotAnsi).toContain("?6h");
	});

	test("reclaims color-scheme reporting leaked by a dead TUI", async () => {
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(`${CSI}?2031h`);
		expect(emulator.getModes().colorSchemeReporting).toBe(true);

		await emulator.writeSync(PROMPT_MARKER);
		expect(emulator.getModes().colorSchemeReporting).toBe(false);

		// A live TUI keeps it and warm reattach re-arms it.
		await emulator.writeSync(`${CSI}?2031h`);
		expect(emulator.getSnapshot().rehydrateSequences).toContain("?2031h");
	});

	test("reclaim never corrupts a sequence split across the marker chunk boundary", async () => {
		// The chunk carrying the prompt marker ends mid-OSC (a title update the
		// shell started); the tail arrives in the next chunk. The reclaim must
		// not inject bytes between them — an injected disarm would abort the
		// half-parsed OSC and bake its tail into every snapshot as junk text.
		await emulator.writeSync(`${PROMPT_MARKER}${CSI}?1002h`);
		await emulator.writeSync(
			`${OSC}777;superset-shell-ready${BEL}${OSC}0;my-ti`,
		);
		await emulator.writeSync(`tle${BEL}prompt$`);

		expect(emulator.getModes().mouseTrackingButtonEvent).toBe(false);
		const snapshot = emulator.getSnapshot();
		expect(snapshot.snapshotAnsi).toContain("prompt$");
		expect(snapshot.snapshotAnsi).not.toContain("my-ti");
		expect(snapshot.snapshotAnsi).not.toContain("?1002h");
	});

	test("clears modes when the marker is split across chunks", async () => {
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(ARM_TUI_MODES);

		await emulator.writeSync(`${OSC.slice(0, 1)}`);
		await emulator.writeSync(`${OSC.slice(1)}777;superset-`);
		await emulator.writeSync(`shell-ready${BEL}`);

		expect(emulator.getModes().mouseTrackingAnyEvent).toBe(false);
		expect(emulator.getModes().focusReporting).toBe(false);
	});

	test("clears modes when the split lands before the terminator", async () => {
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(ARM_TUI_MODES);

		await emulator.writeSync(`${OSC}777;superset-shell-ready`);
		expect(emulator.getModes().mouseTrackingAnyEvent).toBe(true);

		await emulator.writeSync(BEL);
		expect(emulator.getModes().mouseTrackingAnyEvent).toBe(false);
	});

	test("ignores lookalikes that are not Superset prompt markers", async () => {
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(ARM_TUI_MODES);

		// Plain text, a urxvt-style 777 notification, a 777 payload with a
		// suffix, and a bare third-party 133;A (iTerm2/fish integrations emit
		// those at prompts of shells we did not wrap — including inside a live
		// tmux) must all leave armed modes alone.
		await emulator.writeSync("]777;superset-shell-ready\x07 literal");
		await emulator.writeSync(`${OSC}777;notify;title;body${BEL}`);
		await emulator.writeSync(`${OSC}777;superset-shell-ready;k=s${BEL}`);
		await emulator.writeSync(`${OSC}133;A${BEL}`);

		expect(emulator.getModes().mouseTrackingAnyEvent).toBe(true);
		expect(emulator.getModes().bracketedPaste).toBe(true);
	});

	test("does not reclaim on a tmux-passthrough-wrapped marker", async () => {
		// `ESC Ptmux; ESC ESC ]133;A BEL ESC \` — a passthrough-wrapped inner
		// prompt marker arriving while tmux is alive in the foreground with
		// mouse armed must not clear tmux's modes (#5038-class regression).
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(`${ENABLE_MOUSE_NORMAL}${ENABLE_MOUSE_SGR}`);

		await emulator.writeSync(`${ESC}Ptmux;${ESC}${ESC}]133;A${BEL}${ESC}\\`);

		expect(emulator.getModes().mouseTrackingNormal).toBe(true);
	});

	test("disarm sequence returns an armed emulator to default modes", async () => {
		await emulator.writeSync(`${ARM_TUI_MODES}${ENTER_ALT_SCREEN}`);

		await emulator.writeSync(INPUT_MODE_DISARM_SEQUENCE);

		expect(modesEqual(emulator.getModes(), DEFAULT_MODES)).toBe(true);
	});
});

describe("Mouse protocol exclusivity", () => {
	// xterm's mouse protocol is one mutually-exclusive unit: arming any level
	// supersedes the previous one, resetting any level clears the protocol
	// entirely. The shadow map must mirror that or a stale flag can shield a
	// dead TUI's protocol from reclaim.
	const PROMPT_MARKER = `${OSC}777;superset-shell-ready${BEL}${OSC}133;A${BEL}`;

	let emulator: InstanceType<typeof HeadlessEmulator>;

	beforeEach(() => {
		emulator = new HeadlessEmulator({ cols: 80, rows: 24 });
	});

	afterEach(() => {
		emulator.dispose();
	});

	test("arming a level supersedes the previous one", async () => {
		await emulator.writeSync(`${CSI}?1000h${CSI}?1002h`);

		const modes = emulator.getModes();
		expect(modes.mouseTrackingNormal).toBe(false);
		expect(modes.mouseTrackingButtonEvent).toBe(true);
		const snapshot = emulator.getSnapshot();
		expect(snapshot.rehydrateSequences).toContain("?1002h");
		expect(snapshot.rehydrateSequences).not.toContain("?1000h");
	});

	test("resetting any level clears the whole protocol", async () => {
		await emulator.writeSync(`${CSI}?1002h${CSI}?1000l`);

		const modes = emulator.getModes();
		expect(modes.mouseTrackingButtonEvent).toBe(false);
		expect(modes.mouseTrackingNormal).toBe(false);
		expect(emulator.getSnapshot().rehydrateSequences).toBe("");
	});

	test("a downgraded protocol rehydrates at the downgraded level", async () => {
		await emulator.writeSync(`${CSI}?1003h${CSI}?1000h`);

		const rehydrate = emulator.getSnapshot().rehydrateSequences;
		expect(rehydrate).toContain("?1000h");
		expect(rehydrate).not.toContain("?1003h");
	});

	test("a superseded shell-owned level cannot shield a dead TUI's protocol", async () => {
		// Shell init armed ?1000h (shell-owned). A TUI then armed ?1002h —
		// physically replacing the shell's level — and died. The reclaim must
		// clear the protocol, broadcast the disarm, and strip the snapshot;
		// a stale shell-owned flag must not make the mouse group look armed.
		await emulator.writeSync(`${CSI}?1000h`);
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(`${CSI}?1002h`);
		await emulator.writeSync(PROMPT_MARKER);

		const modes = emulator.getModes();
		expect(modes.mouseTrackingButtonEvent).toBe(false);
		expect(modes.mouseTrackingNormal).toBe(false);
		const snapshot = emulator.getSnapshot();
		expect(snapshot.snapshotAnsi).not.toContain("?1002h");
		expect(snapshot.rehydrateSequences).not.toContain("?1000h");
		expect(emulator.takeForegroundReclaimClientDisarm()).toContain("?1003l");
	});

	// This xterm build implements no mode 1001 (highlight tracking): DECSET
	// and DECRST 1001 are no-ops in the internal terminal and the renderer
	// alike, so the shadow map must ignore them too — treating them as a real
	// protocol level would clear modes the terminal still has armed.
	test("DECSET 1001 does not displace the armed protocol", async () => {
		await emulator.writeSync(`${CSI}?1002h${CSI}?1001h`);

		expect(emulator.getModes().mouseTrackingButtonEvent).toBe(true);
		const snapshot = emulator.getSnapshot();
		expect(snapshot.snapshotAnsi).toContain("?1002h");
		expect(snapshot.rehydrateSequences).toContain("?1002h");
		expect(snapshot.rehydrateSequences).not.toContain("?1001h");
	});

	test("DECRST 1001 does not clear the armed protocol", async () => {
		await emulator.writeSync(`${CSI}?1002h${CSI}?1001l`);

		expect(emulator.getModes().mouseTrackingButtonEvent).toBe(true);
		expect(emulator.getSnapshot().snapshotAnsi).toContain("?1002h");
	});

	test("a TUI's ?1001h cannot unseat a shell-owned level", async () => {
		// Shell init armed ?1000h (shell-owned). A TUI sent ?1001h — a no-op
		// in this xterm, so the shell's mode stayed physically armed — and
		// died. The reclaim must leave the mode and its grant alone: nothing
		// to disarm, snapshot intact.
		await emulator.writeSync(`${CSI}?1000h`);
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(`${CSI}?1001h`);
		await emulator.writeSync(PROMPT_MARKER);

		expect(emulator.getModes().mouseTrackingNormal).toBe(true);
		expect(emulator.getSnapshot().snapshotAnsi).toContain("?1000h");
		expect(emulator.takeForegroundReclaimClientDisarm()).toBe("");
	});
});

describe("Foreground-reclaim client disarm", () => {
	const PROMPT_MARKER = `${OSC}777;superset-shell-ready${BEL}${OSC}133;A${BEL}`;

	let emulator: InstanceType<typeof HeadlessEmulator>;

	beforeEach(() => {
		emulator = new HeadlessEmulator({ cols: 80, rows: 24 });
	});

	afterEach(() => {
		emulator.dispose();
	});

	test("emits DECRSTs for the cleared groups, once", async () => {
		let reclaims = 0;
		emulator.onForegroundReclaim(() => reclaims++);

		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(`${CSI}?1002h${ENABLE_FOCUS_REPORTING}`);
		await emulator.writeSync(PROMPT_MARKER);

		expect(reclaims).toBe(1);
		const disarm = emulator.takeForegroundReclaimClientDisarm();
		expect(disarm).toContain("?1003l");
		expect(disarm).toContain("?1004l");
		expect(emulator.takeForegroundReclaimClientDisarm()).toBe("");
	});

	test("suppresses the disarm for a group re-armed before collection", async () => {
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(`${CSI}?1002h${ENABLE_FOCUS_REPORTING}`);
		await emulator.writeSync(PROMPT_MARKER);
		// A new TUI re-armed the mouse before the session settled its pipeline;
		// broadcasting ?1003l now would clear the whole protocol under it.
		await emulator.writeSync(`${CSI}?1003h`);

		const disarm = emulator.takeForegroundReclaimClientDisarm();
		expect(disarm).not.toContain("?1003l");
		expect(disarm).toContain("?1004l");
	});

	test("fires no reclaim when nothing leaked", async () => {
		let reclaims = 0;
		emulator.onForegroundReclaim(() => reclaims++);

		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync("plain output\r\n");
		await emulator.writeSync(PROMPT_MARKER);

		expect(reclaims).toBe(0);
		expect(emulator.takeForegroundReclaimClientDisarm()).toBe("");
	});
});

describe("Alt-screen foreground reclaim (buffer exit)", () => {
	// A fullscreen TUI that dies uncleanly leaves the terminal switched to
	// the alternate buffer. The buffer is content — the shell draws the
	// post-kill prompt into it — so unlike the input modes above it cannot be
	// reconciled out of snapshots at read time. Instead the marker records a
	// pending exit and the session collects it once its pipeline settles,
	// injecting the matching DECRST into the internal terminal and the
	// client broadcast (the one amendment to the no-injected-bytes rule).
	const PROMPT_MARKER = `${OSC}777;superset-shell-ready${BEL}${OSC}133;A${BEL}`;

	let emulator: InstanceType<typeof HeadlessEmulator>;

	beforeEach(() => {
		emulator = new HeadlessEmulator({ cols: 80, rows: 24 });
	});

	afterEach(() => {
		emulator.dispose();
	});

	test("exits the alt screen a dead TUI leaked, at the settled point", async () => {
		let reclaims = 0;
		emulator.onForegroundReclaim(() => reclaims++);
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(`${ENTER_ALT_SCREEN}${MOVE_CURSOR(1, 1)}tui`);

		await emulator.writeSync(PROMPT_MARKER); // vi died; shell prompted

		// A reclaim with only the buffer leaked still notifies the session.
		expect(reclaims).toBe(1);
		// Nothing is injected at the marker itself (mid-parse hazard): the
		// exit waits for the settled collection.
		expect(emulator.getModes().alternateScreen).toBe(true);

		expect(emulator.takeForegroundReclaimBufferExit()).toBe(`${CSI}?1049l`);
		await emulator.flush();
		expect(emulator.getModes().alternateScreen).toBe(false);
		expect(emulator.getSnapshot().snapshotAnsi).not.toContain("?1049h");
		// Consumed: a second collection has nothing to exit.
		expect(emulator.takeForegroundReclaimBufferExit()).toBe("");
	});

	test("emits the low matching the variant that armed the buffer", async () => {
		// Only DECRST 1049 restores the cursor its DECSET saved; pairing a
		// 47/1047 arm with ?1049l would restore a never-saved cursor.
		for (const param of [47, 1047]) {
			const variantEmulator = new HeadlessEmulator({ cols: 80, rows: 24 });
			await variantEmulator.writeSync(PROMPT_MARKER);
			await variantEmulator.writeSync(`${CSI}?${param}h`);
			await variantEmulator.writeSync(PROMPT_MARKER);

			expect(variantEmulator.takeForegroundReclaimBufferExit()).toBe(
				`${CSI}?${param}l`,
			);
			variantEmulator.dispose();
		}
	});

	test("output written after the exit lands in the normal buffer", async () => {
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(`${ENTER_ALT_SCREEN}${MOVE_CURSOR(1, 1)}tui-junk`);
		await emulator.writeSync(PROMPT_MARKER);

		emulator.takeForegroundReclaimBufferExit();
		await emulator.writeSync("\r\nnext-prompt$");

		const snapshot = emulator.getSnapshot();
		expect(snapshot.snapshotAnsi).toContain("next-prompt$");
		expect(snapshot.snapshotAnsi).not.toContain("tui-junk");
	});

	test("shell-owned alt screen armed before the first prompt survives", async () => {
		// The epoch rule is uniform: state armed before the first marker
		// belongs to shell init and is never reclaimed until its DECRST.
		await emulator.writeSync(ENTER_ALT_SCREEN);
		await emulator.writeSync(PROMPT_MARKER);

		expect(emulator.takeForegroundReclaimBufferExit()).toBe("");
		expect(emulator.getModes().alternateScreen).toBe(true);
		expect(emulator.getSnapshot().snapshotAnsi).toContain("?1049h");
	});

	test("keeps the buffer while the shell has not prompted again", async () => {
		// A live vi and a SIGKILLed-but-unproven vi are indistinguishable
		// until the next prompt marker: the alt screen legitimately stays (a
		// warm reattach of a live TUI must keep it — #5038), and the exit
		// fires only once the shell proves it owns the foreground.
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(`${ENTER_ALT_SCREEN}${MOVE_CURSOR(2, 2)}vim`);

		expect(emulator.takeForegroundReclaimBufferExit()).toBe("");
		expect(emulator.getSnapshot().snapshotAnsi).toContain("?1049h");
	});

	test("suspend/fg: the TUI's own exit leaves nothing to reclaim", async () => {
		// ^Z — vim writes t_TE (exit alt) before suspending, the shell
		// prompts, then fg re-arms. Neither point may emit a second low.
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(`${ENTER_ALT_SCREEN}vim body`);
		await emulator.writeSync(EXIT_ALT_SCREEN); // t_TE on ^Z
		await emulator.writeSync(PROMPT_MARKER); // suspend prompt

		expect(emulator.takeForegroundReclaimBufferExit()).toBe("");

		await emulator.writeSync(ENTER_ALT_SCREEN); // fg: t_TI re-arms
		expect(emulator.takeForegroundReclaimBufferExit()).toBe("");
		expect(emulator.getSnapshot().snapshotAnsi).toContain("?1049h");
	});

	test("a new TUI arming alt after the marker cancels the pending exit", async () => {
		// Dead TUI leaked alt, the shell prompted, and a new TUI entered the
		// alt screen before the pipeline settled. Emitting the exit now would
		// kick the live TUI back to the normal buffer.
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(ENTER_ALT_SCREEN);
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(ENTER_ALT_SCREEN);

		expect(emulator.takeForegroundReclaimBufferExit()).toBe("");
		expect(emulator.getSnapshot().snapshotAnsi).toContain("?1049h");
	});

	test("a trailing DECRST cancels the pending exit (nothing left to leave)", async () => {
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(ENTER_ALT_SCREEN);
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(EXIT_ALT_SCREEN);

		expect(emulator.takeForegroundReclaimBufferExit()).toBe("");
	});

	test("RIS between the marker and the settle point suppresses the exit", async () => {
		// ESC c resets to the normal buffer without a DECRST the shadow map
		// would see. The physical-buffer re-check must keep the exit from
		// being written while already in the normal buffer, where ?1049l
		// would perform a cursor restore.
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(ENTER_ALT_SCREEN);
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(`${ESC}c`);

		expect(emulator.takeForegroundReclaimBufferExit()).toBe("");
	});

	test("mouse disarm and buffer exit reclaim together for a dead fullscreen TUI", async () => {
		await emulator.writeSync(PROMPT_MARKER);
		await emulator.writeSync(
			`${ENTER_ALT_SCREEN}${CSI}?1002h${ENABLE_MOUSE_SGR}`,
		);
		await emulator.writeSync(PROMPT_MARKER);

		expect(emulator.takeForegroundReclaimClientDisarm()).toContain("?1003l");
		expect(emulator.takeForegroundReclaimBufferExit()).toBe(`${CSI}?1049l`);
		await emulator.flush();
		const snapshot = emulator.getSnapshot();
		expect(snapshot.snapshotAnsi).not.toContain("?1049h");
		expect(snapshot.snapshotAnsi).not.toContain("?1002h");
	});
});

// Helper function to apply snapshot asynchronously
async function applySnapshotAsync(
	emulator: InstanceType<typeof HeadlessEmulator>,
	snapshot: { rehydrateSequences: string; snapshotAnsi: string },
): Promise<void> {
	await emulator.writeSync(snapshot.rehydrateSequences);
	await emulator.writeSync(snapshot.snapshotAnsi);
}
