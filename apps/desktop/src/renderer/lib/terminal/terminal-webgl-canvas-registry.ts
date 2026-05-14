export const TERMINAL_WEBGL_CANVAS_ATTRIBUTE = "data-terminal-webgl-canvas";

let terminalWebglCanvases = new WeakSet<HTMLCanvasElement>();

export function markTerminalWebglCanvas(canvas: HTMLCanvasElement): void {
	terminalWebglCanvases.add(canvas);
	canvas.setAttribute(TERMINAL_WEBGL_CANVAS_ATTRIBUTE, "true");
}

export function unmarkTerminalWebglCanvas(canvas: HTMLCanvasElement): void {
	terminalWebglCanvases.delete(canvas);
	canvas.removeAttribute(TERMINAL_WEBGL_CANVAS_ATTRIBUTE);
}

export function isTerminalWebglCanvas(canvas: HTMLCanvasElement): boolean {
	return (
		terminalWebglCanvases.has(canvas) ||
		canvas.getAttribute(TERMINAL_WEBGL_CANVAS_ATTRIBUTE) === "true"
	);
}

export function resetTerminalWebglCanvasRegistryForTesting(): void {
	terminalWebglCanvases = new WeakSet();
}
