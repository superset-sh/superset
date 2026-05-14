import { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal as XTerm } from "@xterm/xterm";
import { markTerminalSessionReplayBlocked } from "./terminal-session-replay";
import {
	markTerminalWebglCanvas,
	resetTerminalWebglCanvasRegistryForTesting,
	unmarkTerminalWebglCanvas,
} from "./terminal-webgl-canvas-registry";

export interface TerminalWebglAddonHandle {
	dispose: () => void;
}

// Once WebGL fails, skip it for all subsequent runtimes (VS Code pattern).
let suggestedRendererType: "dom" | undefined;

export function resetTerminalWebglAddonStateForTesting(): void {
	suggestedRendererType = undefined;
	resetTerminalWebglCanvasRegistryForTesting();
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

function scheduleAnimationFrame(callback: () => void): () => void {
	if (typeof requestAnimationFrame !== "function") {
		const timeoutId = setTimeout(callback, 0);
		return () => clearTimeout(timeoutId);
	}

	const rafId = requestAnimationFrame(callback);
	return () => cancelAnimationFrame(rafId);
}

export function loadTerminalWebglAddon(
	terminal: XTerm,
): TerminalWebglAddonHandle {
	let disposed = false;
	let webglAddon: WebglAddon | null = null;
	let cancelPendingEnable: (() => void) | null = null;
	let fallbackTimeoutId: ReturnType<typeof setTimeout> | null = null;
	let rootContextLossRemove: (() => void) | null = null;
	let fallbackScheduled = false;
	let markedWebglCanvases: HTMLCanvasElement[] = [];

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
			unmarkTerminalWebglCanvas(canvas);
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
			markTerminalWebglCanvas(canvas);
			markTerminalSessionReplayBlocked(canvas);
		}
	};

	const repaint = () => {
		try {
			terminal.refresh(0, Math.max(0, terminal.rows - 1));
		} catch {}
	};

	const disposeAddon = (options: { markDomFallback: boolean }) => {
		cancelPendingEnable?.();
		cancelPendingEnable = null;
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
		fallbackTimeoutId = setTimeout(() => {
			fallbackTimeoutId = null;
			disposeAddon({ markDomFallback: false });
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

	if (suggestedRendererType !== "dom") {
		cancelPendingEnable = scheduleAnimationFrame(() => {
			cancelPendingEnable = null;
			if (disposed || webglAddon || suggestedRendererType === "dom") return;

			let addon: WebglAddon | null = null;
			try {
				addon = new WebglAddon();
				addon.onContextLoss(fallbackToDom);
				fallbackScheduled = false;
				attachContextLossListener();
				terminal.loadAddon(addon);
				webglAddon = addon;
				markWebglCanvases();
			} catch {
				suggestedRendererType = "dom";
				removeContextLossListener();
				unmarkWebglCanvases();
				if (addon) {
					try {
						addon.dispose();
					} catch {}
				}
			}
		});
	}

	return {
		dispose: () => {
			disposed = true;
			disposeAddon({ markDomFallback: false });
		},
	};
}
