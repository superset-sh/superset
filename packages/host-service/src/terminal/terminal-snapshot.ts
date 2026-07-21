import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Terminal: HeadlessTerminal } =
	require("@xterm/headless") as typeof import("@xterm/headless");

type HeadlessInternals = {
	_core?: { _writeBuffer?: { writeSync(data: string | Uint8Array): void } };
};

export interface RenderTerminalSnapshotInput {
	data: Uint8Array;
	cols: number;
	rows: number;
	lines: number;
}

/** Render recent PTY bytes as the terminal screen's last logical text lines. */
export function renderTerminalSnapshot({
	data,
	cols,
	rows,
	lines,
}: RenderTerminalSnapshotInput): string {
	if (!Number.isInteger(lines) || lines < 1 || lines > 1000) {
		throw new Error("snapshot lines must be an integer from 1 to 1000");
	}
	const terminal = new HeadlessTerminal({
		cols,
		rows,
		scrollback: 1000,
		allowProposedApi: true,
	});
	try {
		// Terminal.write is async-buffered and has no public synchronous
		// equivalent. @xterm/headless is therefore pinned to an exact version in
		// this package, and terminal-snapshot.test.ts exercises this compatibility
		// boundary so dependency upgrades fail before reaching the read endpoint.
		const writeBuffer = (terminal as unknown as HeadlessInternals)._core
			?._writeBuffer;
		if (typeof writeBuffer?.writeSync !== "function") {
			throw new Error("@xterm/headless synchronous write API is unavailable");
		}
		writeBuffer.writeSync(data);

		const buffer = terminal.buffer.active;
		const cursorLine = buffer.baseY + buffer.cursorY;
		let lastContentLine = -1;
		for (let index = buffer.length - 1; index >= 0; index--) {
			if (buffer.getLine(index)?.translateToString(true) !== "") {
				lastContentLine = index;
				break;
			}
		}
		const endLine = Math.max(lastContentLine, cursorLine);
		if (endLine < 0) return "";

		const logicalLines: string[] = [];
		for (let index = 0; index <= endLine; index++) {
			const line = buffer.getLine(index);
			if (!line) continue;
			const text = line.translateToString(false);
			if (line.isWrapped && logicalLines.length > 0) {
				logicalLines[logicalLines.length - 1] += text;
			} else {
				logicalLines.push(text);
			}
		}

		return logicalLines
			.map((line) => line.trimEnd())
			.slice(-lines)
			.join("\n");
	} finally {
		terminal.dispose();
	}
}
