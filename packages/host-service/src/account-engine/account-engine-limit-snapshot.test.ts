/**
 * KTD7 gate 2: what `snapshotTerminal` hands the matcher must be the visible
 * screen and nothing above it. The producer pops trailing blank rows off the
 * snapshot, so the window is `rows - trimmedRows`; slicing the raw `rows`
 * starts that many rows above the viewport top and reaches into scrollback,
 * where a killed session's limit message is exactly what kill-and-resume
 * leaves behind. Driven through the real `createModeTracker` on purpose — a
 * hand-written snapshot string never exercises the trim.
 */

import { describe, expect, it, mock } from "bun:test";
import type { HostDb } from "../db/index.ts";
import {
	createModeTracker,
	type TerminalSnapshot,
} from "../terminal/terminal-mode-tracker.ts";
import type { TerminalAgentStore } from "../terminal-agents/index.ts";

const enc = new TextEncoder();

let currentSnapshot: TerminalSnapshot;

const realTerminal = await import("../terminal/terminal.ts");
mock.module("../terminal/terminal.ts", () => ({
	...realTerminal,
	snapshotSession: async () => ({ success: true, ...currentSnapshot }),
}));

const { createAccountEngineHostDeps } = await import("./host-deps.ts");

function hostDeps() {
	return createAccountEngineHostDeps({
		db: {} as HostDb,
		terminalAgentStore: {
			get: () => ({ workspaceId: "ws-1" }),
		} as unknown as TerminalAgentStore,
		makeContext: () => {
			throw new Error("no launch in this test");
		},
		isBracketedPasteActive: () => false,
	});
}

/** Feed a real headless emulator and take the snapshot host-deps would read. */
function snapshotOf(feed: (write: (data: string) => void) => void) {
	const tracker = createModeTracker(80, 24);
	feed((data) => tracker.feed(enc.encode(data)));
	const snapshot = tracker.snapshot(800);
	tracker.dispose();
	return snapshot;
}

describe("snapshotTerminal", () => {
	it("hides a limit line left in scrollback above a cleared screen", async () => {
		currentSnapshot = snapshotOf((write) => {
			write("You've hit your usage limit.\r\n");
			for (let i = 1; i <= 40; i += 1) write(`old-${i}\r\n`);
			// The relaunch kill-and-resume performs: screen cleared, a short
			// new screen drawn, the old session's limit line still in
			// normal-buffer scrollback above it.
			write("\x1b[2J\x1b[H");
			write("new-1\r\nnew-2\r\nnew-3");
		});
		// The defect is only visible against a snapshot that really trimmed.
		expect(currentSnapshot.trimmedRows).toBeGreaterThan(0);
		expect(currentSnapshot.text).toContain("You've hit your usage limit.");

		const screen = await hostDeps().snapshotTerminal("term-1");
		expect(screen).not.toContain("You've hit your usage limit.");
		expect(screen).toBe("new-1\nnew-2\nnew-3");
	});

	it("returns a limit line that is genuinely on screen", async () => {
		currentSnapshot = snapshotOf((write) => {
			for (let i = 1; i <= 40; i += 1) write(`old-${i}\r\n`);
			write("You've hit your usage limit.");
		});

		const screen = await hostDeps().snapshotTerminal("term-1");
		expect(screen).toContain("You've hit your usage limit.");
	});
});
