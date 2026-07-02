/**
 * Reproduction + fix verification for issue #5358:
 * "Mouse movements typing into superset".
 *
 * Scenario: a previous terminal session had a foreground program (a coding agent,
 * vim, htop, …) that enabled mouse tracking. After a reboot the app cold-restores
 * the session from a serialized snapshot. `@xterm/addon-serialize` re-emits the
 * mouse-tracking enable sequences, so writing the snapshot into the fresh terminal
 * turns mouse reporting back on — but the program that wanted it is gone. xterm.js
 * then writes pointer coordinates to the restored shell on every mouse move, and
 * the shell echoes them as typed text.
 *
 * We model the front-end terminal with the headless emulator (same xterm parser +
 * serialize addon used to build snapshots), which faithfully tracks DEC private
 * mode state.
 */

import { describe, expect, test } from "bun:test";
import { HeadlessEmulator } from "main/lib/terminal-host/headless-emulator";
import {
	DISABLE_MOUSE_REPORTING_SEQUENCE,
	withMouseReportingReset,
} from "./mouseModeReset";

const ESC = "\x1b";
const CSI = `${ESC}[`;

// A coding agent / TUI enables any-event tracking + SGR coordinates on startup.
const ENABLE_MOUSE_ANY_EVENT = `${CSI}?1003h`;
const ENABLE_MOUSE_SGR = `${CSI}?1006h`;

/** Build the snapshot ANSI a daemon would persist for a mouse-tracking session. */
async function buildSnapshotWithMouseTracking(): Promise<string> {
	const source = new HeadlessEmulator({ cols: 80, rows: 24 });
	try {
		await source.writeSync(`${ENABLE_MOUSE_ANY_EVENT}${ENABLE_MOUSE_SGR}`);
		await source.writeSync("$ some command output\r\n");
		return (await source.getSnapshotAsync()).snapshotAnsi;
	} finally {
		source.dispose();
	}
}

describe("issue #5358 — restored snapshot leaves mouse reporting enabled", () => {
	test("serialized snapshot re-emits a mouse-tracking enable sequence", async () => {
		const snapshotAnsi = await buildSnapshotWithMouseTracking();
		// Documents the root cause: the snapshot carries the enable sequence forward.
		expect(snapshotAnsi).toContain("?1003h");
	});

	test("writing the raw snapshot into a fresh terminal re-enables mouse tracking", async () => {
		const snapshotAnsi = await buildSnapshotWithMouseTracking();

		// Fresh terminal == the cold-restored xterm with no foreground program.
		const restored = new HeadlessEmulator({ cols: 80, rows: 24 });
		try {
			await restored.writeSync(snapshotAnsi);
			// This is the bug: mouse reporting is on, so pointer moves become input.
			expect(restored.getModes().mouseTrackingAnyEvent).toBe(true);
		} finally {
			restored.dispose();
		}
	});

	test("restored content guarded with the reset leaves mouse reporting disabled", async () => {
		const snapshotAnsi = await buildSnapshotWithMouseTracking();

		const restored = new HeadlessEmulator({ cols: 80, rows: 24 });
		try {
			// The fix: what the cold-restore path now writes into xterm.
			await restored.writeSync(withMouseReportingReset(snapshotAnsi));

			const modes = restored.getModes();
			expect(modes.mouseTrackingAnyEvent).toBe(false);
			expect(modes.mouseTrackingNormal).toBe(false);
			expect(modes.mouseTrackingButtonEvent).toBe(false);
			expect(modes.mouseTrackingX10).toBe(false);
			expect(modes.mouseSgr).toBe(false);
		} finally {
			restored.dispose();
		}
	});

	test("reset sequence disables every tracked mouse mode", async () => {
		const emulator = new HeadlessEmulator({ cols: 80, rows: 24 });
		try {
			// Turn on every mouse mode the daemon snapshots, then apply the reset.
			await emulator.writeSync(
				`${CSI}?9h${CSI}?1000h${CSI}?1002h${CSI}?1003h${CSI}?1006h`,
			);
			await emulator.writeSync(DISABLE_MOUSE_REPORTING_SEQUENCE);

			const modes = emulator.getModes();
			expect(modes.mouseTrackingX10).toBe(false);
			expect(modes.mouseTrackingNormal).toBe(false);
			expect(modes.mouseTrackingButtonEvent).toBe(false);
			expect(modes.mouseTrackingAnyEvent).toBe(false);
			expect(modes.mouseSgr).toBe(false);
		} finally {
			emulator.dispose();
		}
	});
});
