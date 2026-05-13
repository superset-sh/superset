import { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal as XTerm } from "@xterm/xterm";

export interface TerminalWebglAddonController {
	enable: () => void;
	disable: () => void;
	dispose: () => void;
}

// Once WebGL fails, skip it for all subsequent runtimes (VS Code pattern).
let suggestedRendererType: "dom" | undefined;

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
	let enableRafId: number | null = null;
	let rootContextLossRemove: (() => void) | null = null;
	let fallbackScheduled = false;

	const clearEnableRaf = () => {
		if (enableRafId === null) return;
		cancelAnimationFrame(enableRafId);
		enableRafId = null;
	};

	const removeContextLossListener = () => {
		rootContextLossRemove?.();
		rootContextLossRemove = null;
	};

	const repaint = () => {
		try {
			terminal.refresh(0, Math.max(0, terminal.rows - 1));
		} catch {}
	};

	const disposeAddon = (options: { markDomFallback: boolean }) => {
		clearEnableRaf();
		removeContextLossListener();
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
		console.info("[terminal:webgl] context lost; falling back to DOM renderer");
		setTimeout(() => {
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
					attachContextLossListener();
					terminal.loadAddon(addon);
					webglAddon = addon;
				} catch {
					console.warn(
						"[terminal:webgl] failed to load; falling back to DOM renderer",
					);
					suggestedRendererType = "dom";
					webglAddon = null;
					removeContextLossListener();
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
