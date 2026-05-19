import { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal as XTerm } from "@xterm/xterm";

type Disposable = { dispose: () => void };

const ATLAS_GUARD_MIN_PAGE_SIZE = 2048;

// Once WebGL fails, skip it for all subsequent runtimes in this renderer.
let suggestedRendererType: "webgl" | "dom" | undefined;

function getObjectProperty(source: unknown, key: string): unknown {
	if (!source || (typeof source !== "object" && typeof source !== "function")) {
		return undefined;
	}
	return (source as Record<string, unknown>)[key];
}

function getNumberProperty(source: unknown, key: string): number | null {
	const value = getObjectProperty(source, key);
	return typeof value === "number" ? value : null;
}

function getBooleanProperty(source: unknown, key: string): boolean | null {
	const value = getObjectProperty(source, key);
	return typeof value === "boolean" ? value : null;
}

function getTerminalRenderer(terminal: XTerm): unknown {
	const core = getObjectProperty(terminal, "_core");
	const renderService = getObjectProperty(core, "_renderService");
	const rendererHolder = getObjectProperty(renderService, "_renderer");
	return getObjectProperty(rendererHolder, "value") ?? rendererHolder;
}

function shouldClearTextureAtlas(terminal: XTerm): boolean {
	const renderer = getTerminalRenderer(terminal);
	const charAtlas = getObjectProperty(renderer, "_charAtlas");
	const pendingAtlasClear =
		getBooleanProperty(charAtlas, "_requestClearModel") === true;
	const rawPages = getObjectProperty(charAtlas, "pages");
	if (!Array.isArray(rawPages)) return false;

	const pageSizes = rawPages
		.map((page) =>
			getNumberProperty(getObjectProperty(page, "canvas"), "width"),
		)
		.filter((size): size is number => size !== null);

	return (
		pendingAtlasClear ||
		pageSizes.some((size) => size >= ATLAS_GUARD_MIN_PAGE_SIZE)
	);
}

function refreshTerminal(terminal: XTerm): void {
	terminal.refresh(0, Math.max(0, terminal.rows - 1));
}

export function scheduleWebglAddon(
	terminal: XTerm,
	options: { isDisposed?: () => boolean } = {},
): () => void {
	let disposed = false;
	let webglAddon: WebglAddon | null = null;
	let loadRafId: number | null = null;
	let clearRafId: number | null = null;
	const disposables: Disposable[] = [];

	const isDisposed = () => disposed || (options.isDisposed?.() ?? false);

	const cleanupWebgl = () => {
		while (disposables.length > 0) {
			try {
				disposables.pop()?.dispose();
			} catch {}
		}
		try {
			webglAddon?.dispose();
		} catch {}
		webglAddon = null;
	};

	const clearAtlasIfNeeded = () => {
		clearRafId = null;
		if (isDisposed() || !webglAddon) return;
		if (!shouldClearTextureAtlas(terminal)) return;

		try {
			webglAddon.clearTextureAtlas();
			refreshTerminal(terminal);
			requestAnimationFrame(() => {
				if (!isDisposed()) refreshTerminal(terminal);
			});
		} catch {}
	};

	const scheduleAtlasClear = () => {
		if (isDisposed() || clearRafId !== null) return;
		clearRafId = requestAnimationFrame(clearAtlasIfNeeded);
	};

	loadRafId = requestAnimationFrame(() => {
		loadRafId = null;
		if (isDisposed() || suggestedRendererType === "dom") return;

		try {
			webglAddon = new WebglAddon();
			disposables.push(
				webglAddon.onContextLoss(() => {
					suggestedRendererType = "dom";
					cleanupWebgl();
					refreshTerminal(terminal);
					requestAnimationFrame(() => {
						if (!isDisposed()) refreshTerminal(terminal);
					});
				}),
				webglAddon.onAddTextureAtlasCanvas(scheduleAtlasClear),
				webglAddon.onRemoveTextureAtlasCanvas(scheduleAtlasClear),
				webglAddon.onChangeTextureAtlas(scheduleAtlasClear),
			);
			terminal.loadAddon(webglAddon);
		} catch {
			suggestedRendererType = "dom";
			cleanupWebgl();
		}
	});

	return () => {
		disposed = true;
		if (loadRafId !== null) {
			cancelAnimationFrame(loadRafId);
			loadRafId = null;
		}
		if (clearRafId !== null) {
			cancelAnimationFrame(clearRafId);
			clearRafId = null;
		}
		cleanupWebgl();
	};
}
