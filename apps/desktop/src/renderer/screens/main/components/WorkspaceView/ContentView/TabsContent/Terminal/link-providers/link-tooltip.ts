import type { ILink, Terminal } from "@xterm/xterm";

class LinkTooltip {
	private element: HTMLElement | null = null;
	private readonly container: HTMLElement;

	constructor(container: HTMLElement) {
		this.container = container;
	}

	show({ x, y, text }: { x: number; y: number; text: string }): void {
		if (!this.element) {
			this.element = document.createElement("div");
			this.element.className = "xterm-hover";
			Object.assign(this.element.style, {
				position: "absolute",
				zIndex: "10",
				pointerEvents: "none",
				padding: "3px 8px",
				borderRadius: "4px",
				fontSize: "12px",
				lineHeight: "1.4",
				whiteSpace: "nowrap",
				backgroundColor: "var(--tooltip-bg, rgba(30, 30, 30, 0.95))",
				color: "var(--tooltip-fg, #ccc)",
				border: "1px solid var(--tooltip-border, rgba(255,255,255,0.1))",
				boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
			});
			this.container.appendChild(this.element);
		}

		this.element.textContent = text;
		this.element.style.left = `${x}px`;
		this.element.style.top = `${y + 20}px`;
		this.element.style.display = "block";
	}

	hide(): void {
		if (this.element) {
			this.element.style.display = "none";
		}
	}

	dispose(): void {
		if (this.element) {
			this.element.remove();
			this.element = null;
		}
	}
}

const isMac =
	typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

export function getUrlTooltipText(): string {
	return isMac ? "⌘+Click to open URL" : "Ctrl+Click to open URL";
}

export function getFileTooltipText(): string {
	return isMac ? "⌘+Click to open file" : "Ctrl+Click to open file";
}

export class TerminalLinkTooltip {
	private tooltip: LinkTooltip | null = null;

	constructor(private readonly terminal: Terminal) {}

	buildHoverCallbacks(text: string): Pick<ILink, "hover" | "leave"> {
		return {
			hover: (event: MouseEvent) => {
				const tooltip = this.getOrCreate();
				if (!tooltip) return;
				const rect = this.terminal.element?.getBoundingClientRect();
				if (!rect) return;
				tooltip.show({
					x: event.clientX - rect.left,
					y: event.clientY - rect.top,
					text,
				});
			},
			leave: () => this.tooltip?.hide(),
		};
	}

	dispose(): void {
		this.tooltip?.dispose();
		this.tooltip = null;
	}

	private getOrCreate(): LinkTooltip | null {
		const container = this.terminal.element;
		if (!container) return null;
		if (!this.tooltip) {
			this.tooltip = new LinkTooltip(container);
		}
		return this.tooltip;
	}
}
