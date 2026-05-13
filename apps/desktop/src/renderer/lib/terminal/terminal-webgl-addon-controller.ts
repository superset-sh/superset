import { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal as XTerm } from "@xterm/xterm";

export interface TerminalWebglAddonController {
	enable: () => void;
	disable: () => void;
	dispose: () => void;
}

// Once WebGL fails, skip it for all subsequent runtimes (VS Code pattern).
let suggestedRendererType: "webgl" | "dom" | undefined;

function afterPendingXtermRefresh(callback: () => void): number | null {
	if (typeof requestAnimationFrame !== "function") {
		setTimeout(callback, 0);
		return null;
	}
	return requestAnimationFrame(() => {
		requestAnimationFrame(callback);
	});
}

export function createTerminalWebglAddonController(
	terminal: XTerm,
): TerminalWebglAddonController {
	let disposed = false;
	let webglAddon: WebglAddon | null = null;
	let enableRafId: number | null = null;
	let rootContextLossRemove: (() => void) | null = null;
	const canvasListeners: Array<() => void> = [];
	let fallbackScheduled = false;

	const clearEnableRaf = () => {
		if (enableRafId === null) return;
		cancelAnimationFrame(enableRafId);
		enableRafId = null;
	};

	const removeCanvasListeners = () => {
		rootContextLossRemove?.();
		rootContextLossRemove = null;
		for (const remove of canvasListeners.splice(0)) {
			remove();
		}
	};

	const repaint = () => {
		try {
			terminal.refresh(0, Math.max(0, terminal.rows - 1));
		} catch {}
	};

	const disposeAddon = (options: { markDomFallback: boolean }) => {
		clearEnableRaf();
		removeCanvasListeners();
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
		if (fallbackScheduled) return;
		fallbackScheduled = true;
		setTimeout(() => {
			disposeAddon({ markDomFallback: true });
		}, 0);
	};

	const attachImmediateContextLossListeners = () => {
		removeCanvasListeners();
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

		const canvases = Array.from(
			element.querySelectorAll<HTMLCanvasElement>(".xterm-screen canvas"),
		);
		for (const canvas of canvases) {
			const onContextLost = (event: Event) => {
				event.preventDefault();
				fallbackToDom();
			};
			canvas.addEventListener("webglcontextlost", onContextLost);
			canvasListeners.push(() => {
				canvas.removeEventListener("webglcontextlost", onContextLost);
			});
		}
	};

	return {
		enable: () => {
			if (
				disposed ||
				webglAddon ||
				enableRafId !== null ||
				suggestedRendererType === "dom"
			) {
				return;
			}

			enableRafId = requestAnimationFrame(() => {
				enableRafId = null;
				if (disposed || webglAddon || suggestedRendererType === "dom") return;

				try {
					const addon = new WebglAddon();
					addon.onContextLoss(fallbackToDom);
					fallbackScheduled = false;
					attachImmediateContextLossListeners();
					terminal.loadAddon(addon);
					webglAddon = addon;
					attachImmediateContextLossListeners();
				} catch {
					suggestedRendererType = "dom";
					webglAddon = null;
					removeCanvasListeners();
				}
			});
		},
		disable: () => {
			fallbackScheduled = false;
			disposeAddon({ markDomFallback: false });
		},
		dispose: () => {
			disposed = true;
			fallbackScheduled = false;
			disposeAddon({ markDomFallback: false });
		},
	};
}
