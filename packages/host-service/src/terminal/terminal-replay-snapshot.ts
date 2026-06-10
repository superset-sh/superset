// Maintains a headless xterm mirror of a PTY session so late remote observers
// can attach with real scrollback, not just a raw byte FIFO tail.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Terminal: HeadlessTerminal } =
	require("@xterm/headless") as typeof import("@xterm/headless");
const { SerializeAddon } =
	require("@xterm/addon-serialize") as typeof import("@xterm/addon-serialize");

const REPLAY_SCROLLBACK = 5000;
const ENTER_ALT_SCREEN = "\x1b[?1049h\x1b[H";

export interface ReplaySnapshotTracker {
	feed(bytes: Uint8Array): void;
	resize(cols: number, rows: number): void;
	serialize(): Uint8Array | null;
	dispose(): void;
}

type HeadlessInternals = {
	_core?: {
		_writeBuffer?: { writeSync(data: string | Uint8Array): void };
		optionsService?: {
			rawOptions: { vtExtensions?: { kittyKeyboard?: boolean } };
		};
	};
};

function flattenAlternateScreenForObserver(snapshot: string): string {
	// SerializeAddon accurately restores xterm state by switching late attachers
	// back into the alternate buffer. That is correct for local restoration, but
	// wrong for remote observers: the alternate buffer has no scrollback, so the
	// observer can only move around the current screen. Keep the normal scrollback
	// authoritative and append the current alternate screen as ordinary rows.
	return snapshot.replace(ENTER_ALT_SCREEN, "\r\n");
}

export function createReplaySnapshotTracker(
	cols: number,
	rows: number,
): ReplaySnapshotTracker {
	const term = new HeadlessTerminal({
		cols,
		rows,
		scrollback: REPLAY_SCROLLBACK,
		allowProposedApi: true,
	});
	const serializeAddon = new SerializeAddon();
	term.loadAddon(serializeAddon);

	const internals = term as unknown as HeadlessInternals;
	const optionsRaw = internals._core?.optionsService?.rawOptions;
	const writeBuffer = internals._core?._writeBuffer;
	if (!optionsRaw || typeof writeBuffer?.writeSync !== "function") {
		throw new Error(
			"@xterm/headless internals not found for replay snapshot tracker. " +
				"Check the pinned @xterm/headless version.",
		);
	}
	optionsRaw.vtExtensions = { kittyKeyboard: true };

	return {
		feed(bytes) {
			writeBuffer.writeSync(bytes);
		},
		resize(nextCols, nextRows) {
			if (term.cols === nextCols && term.rows === nextRows) return;
			term.resize(nextCols, nextRows);
		},
		serialize() {
			const snapshot = flattenAlternateScreenForObserver(
				serializeAddon.serialize({
					scrollback: REPLAY_SCROLLBACK,
				}),
			);
			return snapshot.length > 0 ? new TextEncoder().encode(snapshot) : null;
		},
		dispose() {
			term.dispose();
		},
	};
}
