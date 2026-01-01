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
import { HeadlessEmulator, modesEqual } from "../headless-emulator";
import { DEFAULT_MODES } from "../types";

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
	let emulator: HeadlessEmulator;

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

// Helper function to apply snapshot asynchronously
async function applySnapshotAsync(
	emulator: HeadlessEmulator,
	snapshot: { rehydrateSequences: string; snapshotAnsi: string },
): Promise<void> {
	await emulator.writeSync(snapshot.rehydrateSequences);
	await emulator.writeSync(snapshot.snapshotAnsi);
}
