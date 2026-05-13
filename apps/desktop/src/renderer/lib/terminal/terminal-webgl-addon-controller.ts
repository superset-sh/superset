import { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal as XTerm } from "@xterm/xterm";
import { markTerminalSessionReplayBlocked } from "./terminal-session-replay";

export interface TerminalWebglAddonController {
	enable: () => void;
	disable: () => void;
	dispose: () => void;
}

// Once WebGL fails, skip it for all subsequent runtimes (VS Code pattern).
let suggestedRendererType: "dom" | undefined;
const terminalWebglCanvases = new WeakSet<HTMLCanvasElement>();
const WEBGL_ENABLE_STABILITY_DELAY_MS = 250;

export function isTerminalWebglCanvas(canvas: HTMLCanvasElement): boolean {
	return terminalWebglCanvases.has(canvas);
}

export function resetTerminalWebglAddonStateForTesting(): void {
	suggestedRendererType = undefined;
}

function afterPendingXtermRefresh(callback: () => void): void {
	if (typeof requestAnimationFrame !== "function") {
		setTimeout(callback, 0);
		return;
	}
	requestAnimationFrame(() => {
		requestAnimationFrame(callback);
	});
}

export function createTerminalWebglAddonController(
	terminal: XTerm,
): TerminalWebglAddonController {
	let disposed = false;
	let webglAddon: WebglAddon | null = null;
	let enableTimeoutId: ReturnType<typeof setTimeout> | null = null;
	let enableRafId: number | null = null;
	let fallbackTimeoutId: ReturnType<typeof setTimeout> | null = null;
	let rootContextLossRemove: (() => void) | null = null;
	let fallbackScheduled = false;
	let markedWebglCanvases: HTMLCanvasElement[] = [];

	const clearEnableTimeout = () => {
		if (enableTimeoutId === null) return;
		clearTimeout(enableTimeoutId);
		enableTimeoutId = null;
	};

	const clearEnableRaf = () => {
		if (enableRafId === null) return;
		cancelAnimationFrame(enableRafId);
		enableRafId = null;
	};

	const removeContextLossListener = () => {
		rootContextLossRemove?.();
		rootContextLossRemove = null;
	};

	const clearFallbackTimeout = () => {
		if (fallbackTimeoutId === null) return;
		clearTimeout(fallbackTimeoutId);
		fallbackTimeoutId = null;
	};

	const unmarkWebglCanvases = () => {
		for (const canvas of markedWebglCanvases) {
			terminalWebglCanvases.delete(canvas);
		}
		markedWebglCanvases = [];
	};

	const markWebglCanvases = () => {
		unmarkWebglCanvases();
		const element = terminal.element;
		if (!element) return;
		markedWebglCanvases = Array.from(
			element.querySelectorAll<HTMLCanvasElement>(
				".xterm-screen canvas:not(.xterm-link-layer)",
			),
		);
		for (const canvas of markedWebglCanvases) {
			terminalWebglCanvases.add(canvas);
			canvas.setAttribute("data-terminal-webgl-canvas", "true");
			markTerminalSessionReplayBlocked(canvas);
		}
	};

	const repaint = () => {
		try {
			terminal.refresh(0, Math.max(0, terminal.rows - 1));
		} catch {}
	};

	const disposeAddon = (options: { markDomFallback: boolean }) => {
		clearEnableTimeout();
		clearEnableRaf();
		clearFallbackTimeout();
		removeContextLossListener();
		unmarkWebglCanvases();
		fallbackScheduled = false;
		const addon = webglAddon;
		webglAddon = null;
		if (options.markDomFallback) {
			suggestedRendererType = "dom";
		}
		if (addon) {
			try {
				addon.dispose();
			} catch {}
		}
		afterPendingXtermRefresh(repaint);
	};

	const fallbackToDom = () => {
		if (disposed || fallbackScheduled) return;
		fallbackScheduled = true;
		suggestedRendererType = "dom";
		console.info("[terminal:webgl] context lost; falling back to DOM renderer");
		fallbackTimeoutId = setTimeout(() => {
			fallbackTimeoutId = null;
			disposeAddon({ markDomFallback: true });
		}, 0);
	};

	const attachContextLossListener = () => {
		removeContextLossListener();
		const element = terminal.element;
		if (!element) return;

		const onRootContextLost = (event: Event) => {
			event.preventDefault();
			fallbackToDom();
		};
		element.addEventListener("webglcontextlost", onRootContextLost, true);
		rootContextLossRemove = () => {
			element.removeEventListener("webglcontextlost", onRootContextLost, true);
		};
	};

	return {
		enable: () => {
			if (
				disposed ||
				webglAddon ||
				enableTimeoutId !== null ||
				enableRafId !== null ||
				suggestedRendererType === "dom"
			) {
				return;
			}

			enableTimeoutId = setTimeout(() => {
				enableTimeoutId = null;
				if (disposed || webglAddon || suggestedRendererType === "dom") return;

				enableRafId = requestAnimationFrame(() => {
					enableRafId = null;
					if (disposed || webglAddon || suggestedRendererType === "dom") {
						return;
					}

					try {
						const addon = new WebglAddon();
						addon.onContextLoss(fallbackToDom);
						fallbackScheduled = false;
						attachContextLossListener();
						terminal.loadAddon(addon);
						webglAddon = addon;
						markWebglCanvases();
					} catch {
						console.warn(
							"[terminal:webgl] failed to load; falling back to DOM renderer",
						);
						suggestedRendererType = "dom";
						webglAddon = null;
						removeContextLossListener();
						unmarkWebglCanvases();
					}
				});
			}, WEBGL_ENABLE_STABILITY_DELAY_MS);
		},
		disable: () => {
			disposeAddon({ markDomFallback: false });
		},
		dispose: () => {
			disposed = true;
			disposeAddon({ markDomFallback: false });
		},
	};
}
