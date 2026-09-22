import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";
import { computeLinks } from "./utils/url-parser";

const MAX_URL_LENGTH = 4096;

type Position = ILink["range"]["start"];

function trimUrl(text: string): string {
	const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
	const stack: string[] = [];
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if ("([{".includes(char)) stack.push(char);
		else if (pairs[char]) {
			if (stack.at(-1) !== pairs[char])
				return text.slice(0, i).replace(/[.,;:!?([{]+$/, "");
			stack.pop();
		}
	}
	return text.replace(/[.,;:!?([{]+$/, "");
}

export class UrlLinkProvider implements ILinkProvider {
	constructor(
		private readonly terminal: Terminal,
		private readonly onOpen: (event: MouseEvent, uri: string) => void,
		private readonly onHover?: (event: MouseEvent, uri: string) => void,
		private readonly onLeave?: () => void,
	) {}

	provideLinks(
		bufferLineNumber: number,
		callback: (links: ILink[] | undefined) => void,
	): void {
		const buffer = this.terminal.buffer.active;
		const current = bufferLineNumber - 1;
		if (!buffer.getLine(current)) {
			callback(undefined);
			return;
		}
		const contextRows =
			Math.ceil((MAX_URL_LENGTH * 2) / this.terminal.cols) + 1;
		let first = current;
		let last = current;
		while (
			first > Math.max(0, current - contextRows) &&
			buffer.getLine(first)?.isWrapped
		)
			first--;
		while (last < current + contextRows && buffer.getLine(last + 1)?.isWrapped)
			last++;

		let text = "";
		const starts: Position[] = [];
		const ends: Position[] = [];
		for (let y = first; y <= last; y++) {
			const line = buffer.getLine(y);
			if (!line) break;
			const next = buffer.getLine(y + 1);
			for (let x = 0; x < this.terminal.cols; x++) {
				const cell = line.getCell(x);
				if (!cell || cell.getWidth() === 0) continue;
				const chars = cell.getChars();
				if (
					x === this.terminal.cols - 1 &&
					chars === "" &&
					next?.isWrapped &&
					next.getCell(0)?.getWidth() === 2
				)
					continue;
				const value = chars || " ";
				text += value;
				for (let i = 0; i < value.length; i++) {
					starts.push({ x: x + 1, y: y + 1 });
					ends.push({ x: x + cell.getWidth(), y: y + 1 });
				}
			}
		}

		const links: ILink[] = [];
		for (const match of computeLinks({
			getLineCount: () => 1,
			getLineContent: () => text,
		})) {
			const uri = trimUrl(match.url);
			if (!/^https?:\/\//i.test(uri) || uri.length > MAX_URL_LENGTH) continue;
			try {
				if (!new URL(uri).hostname) continue;
			} catch {
				continue;
			}
			const startIndex = match.range.startColumn - 1;
			const start = starts[startIndex];
			const end = ends[startIndex + uri.length - 1];
			if (
				!start ||
				!end ||
				start.y > bufferLineNumber ||
				end.y < bufferLineNumber
			)
				continue;
			links.push({
				text: uri,
				range: { start, end },
				activate: (event) => this.onOpen(event, uri),
				hover: (event) => this.onHover?.(event, uri),
				leave: () => this.onLeave?.(),
			});
		}
		callback(links.length ? links : undefined);
	}
}
