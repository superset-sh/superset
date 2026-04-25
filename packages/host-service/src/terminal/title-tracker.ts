import { normalizeTerminalTitle } from "@superset/shared/terminal-title";
import { Terminal as HeadlessTerminal } from "@xterm/headless";

export class TerminalTitleTracker {
	private readonly terminal: HeadlessTerminal;
	private title: string | null = null;
	private disposed = false;

	constructor(private readonly onTitleChange: (title: string | null) => void) {
		this.terminal = new HeadlessTerminal({
			cols: 2,
			rows: 1,
			scrollback: 0,
		});

		this.terminal.onTitleChange((title) => {
			this.setTitle(title);
		});

		this.terminal.parser.registerOscHandler(9, (data) => {
			if (!data.startsWith("3;")) return false;
			this.setTitle(data.slice(2));
			return true;
		});
	}

	get currentTitle(): string | null {
		return this.title;
	}

	write(data: string): void {
		if (this.disposed) return;
		this.terminal.write(data);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.terminal.dispose();
	}

	private setTitle(title: string): void {
		const normalizedTitle = normalizeTerminalTitle(title);
		if (this.title === normalizedTitle) return;
		this.title = normalizedTitle;
		this.onTitleChange(normalizedTitle);
	}
}
