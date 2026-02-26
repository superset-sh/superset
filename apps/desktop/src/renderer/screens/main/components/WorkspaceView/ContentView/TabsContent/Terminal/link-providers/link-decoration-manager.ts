import type { IDecoration, IDisposable, IMarker, Terminal } from "@xterm/xterm";

interface TrackedDecoration {
	key: string;
	marker: IMarker;
	decoration: IDecoration;
	markerDisposable: IDisposable;
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>[\]'"]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

function trimTrailingUnbalancedParens(value: string): string {
	let openCount = 0;
	let endIndex = value.length;

	for (let i = 0; i < value.length; i++) {
		if (value[i] === "(") {
			openCount++;
			continue;
		}
		if (value[i] === ")") {
			if (openCount > 0) {
				openCount--;
				continue;
			}
			endIndex = i;
			break;
		}
	}

	let result = value.slice(0, endIndex);
	while (result.endsWith("(")) {
		result = result.slice(0, -1);
	}
	return result;
}

function cleanUrlMatch(raw: string): string {
	return trimTrailingUnbalancedParens(raw).replace(TRAILING_PUNCTUATION, "");
}

export class LinkDecorationManager {
	private readonly decorations: TrackedDecoration[] = [];
	private readonly decoratedPositions = new Set<string>();
	private color: string;
	private lastScannedLine = 0;
	private scanScheduled = false;
	private writeDisposable: IDisposable | null = null;

	constructor(
		private readonly terminal: Terminal,
		color: string,
	) {
		this.color = color;
		this.writeDisposable = terminal.onWriteParsed(() => this.scheduleScan());
		this.scanBuffer();
	}

	updateColor(newColor: string): void {
		if (newColor === this.color) return;
		this.color = newColor;
		this.clearDecorations();
		this.lastScannedLine = 0;
		this.scanBuffer();
	}

	dispose(): void {
		this.writeDisposable?.dispose();
		this.writeDisposable = null;
		this.clearDecorations();
	}

	private scheduleScan(): void {
		if (this.scanScheduled) return;
		this.scanScheduled = true;
		requestAnimationFrame(() => {
			this.scanScheduled = false;
			this.scanBuffer();
		});
	}

	private scanBuffer(): void {
		const buffer = this.terminal.buffer;
		if (buffer.active !== buffer.normal) {
			return;
		}

		const totalLines = buffer.active.baseY + buffer.active.cursorY + 1;
		if (totalLines < this.lastScannedLine) {
			this.clearDecorations();
			this.lastScannedLine = 0;
		}

		const startLine = Math.max(0, this.lastScannedLine - 1);
		for (let i = startLine; i < totalLines; i++) {
			const line = buffer.active.getLine(i);
			if (!line) continue;

			const text = line.translateToString(true);
			if (!text) continue;

			for (const match of text.matchAll(URL_PATTERN)) {
				const cleaned = cleanUrlMatch(match[0]);
				if (!cleaned) continue;
				const col = match.index ?? 0;
				this.addDecoration(i, col, cleaned.length);
			}
		}

		this.lastScannedLine = totalLines;
	}

	private addDecoration(bufferLine: number, col: number, length: number): void {
		const key = `${bufferLine}:${col}:${length}`;
		if (this.decoratedPositions.has(key)) return;

		const cursorAbsLine =
			this.terminal.buffer.active.baseY + this.terminal.buffer.active.cursorY;
		const offset = bufferLine - cursorAbsLine;

		const marker = this.terminal.registerMarker(offset);
		if (!marker) return;

		const decoration = this.terminal.registerDecoration({
			marker,
			x: col,
			width: length,
			foregroundColor: this.color,
			layer: "top",
		});
		if (!decoration) {
			marker.dispose();
			return;
		}

		const tracked: TrackedDecoration = {
			key,
			marker,
			decoration,
			markerDisposable: marker.onDispose(() => {
				this.removeDecoration(tracked);
			}),
		};
		this.decoratedPositions.add(key);
		this.decorations.push(tracked);
	}

	private removeDecoration(tracked: TrackedDecoration): void {
		const idx = this.decorations.indexOf(tracked);
		if (idx !== -1) {
			this.decorations.splice(idx, 1);
		}
		this.decoratedPositions.delete(tracked.key);
		tracked.decoration.dispose();
		tracked.markerDisposable.dispose();
	}

	private clearDecorations(): void {
		for (const tracked of this.decorations) {
			tracked.decoration.dispose();
			tracked.markerDisposable.dispose();
			tracked.marker.dispose();
		}
		this.decorations.length = 0;
		this.decoratedPositions.clear();
	}
}
