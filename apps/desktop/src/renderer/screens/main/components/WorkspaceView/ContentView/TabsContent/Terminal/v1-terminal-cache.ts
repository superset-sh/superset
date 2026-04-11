import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal as XTerm } from "@xterm/xterm";
import { DEBUG_TERMINAL } from "./config";
import {
	type CreateTerminalOptions,
	createTerminalInWrapper,
	type TerminalRendererRef,
} from "./helpers";

/**
 * Cached xterm instance that survives React mount/unmount cycles.
 * Borrows the wrapper-div pattern from v2's terminal-runtime.ts:
 * xterm is opened into a persistent wrapper <div> that can be
 * moved between DOM containers without disposing the terminal.
 */
export interface CachedTerminal {
	xterm: XTerm;
	fitAddon: FitAddon;
	searchAddon: SearchAddon;
	rendererRef: TerminalRendererRef;
	wrapper: HTMLDivElement;
	/** Disposes renderer RAF, query suppression, GPU renderer, etc. */
	cleanupCreation: () => void;
}

const cache = new Map<string, CachedTerminal>();

/** Number of times a cached terminal was reused instead of created. */
let reattachCount = 0;
/** Number of fresh terminal creations. */
let createCount = 0;

export function has(paneId: string): boolean {
	return cache.has(paneId);
}

export function get(paneId: string): CachedTerminal | undefined {
	return cache.get(paneId);
}

/** Return current cache size and lifetime hit/miss stats. */
export function stats(): {
	size: number;
	creates: number;
	reattaches: number;
} {
	return { size: cache.size, creates: createCount, reattaches: reattachCount };
}

export function getOrCreate(
	paneId: string,
	options: CreateTerminalOptions,
): CachedTerminal {
	const existing = cache.get(paneId);
	if (existing) {
		reattachCount++;
		if (DEBUG_TERMINAL) {
			const { size, creates, reattaches } = stats();
			console.log(
				`[v1-terminal-cache] Reusing cached terminal: ${paneId} (cache size=${size}, creates=${creates}, reattaches=${reattaches})`,
			);
		}
		return existing;
	}

	const t0 = performance.now();

	const { xterm, fitAddon, searchAddon, renderer, wrapper, cleanup } =
		createTerminalInWrapper(options);

	const entry: CachedTerminal = {
		xterm,
		fitAddon,
		searchAddon,
		rendererRef: renderer,
		wrapper,
		cleanupCreation: cleanup,
	};

	cache.set(paneId, entry);
	createCount++;

	if (DEBUG_TERMINAL) {
		const elapsed = (performance.now() - t0).toFixed(1);
		const { size, creates, reattaches } = stats();
		console.log(
			`[v1-terminal-cache] Created new terminal: ${paneId} (${elapsed}ms, cache size=${size}, creates=${creates}, reattaches=${reattaches})`,
		);
	}

	return entry;
}

/**
 * Append the cached terminal's wrapper div to a live DOM container.
 * Re-fits, refreshes rendering, and clears stale WebGL texture atlas.
 */
export function attachToContainer(
	paneId: string,
	container: HTMLDivElement,
): void {
	const entry = cache.get(paneId);
	if (!entry) return;

	const t0 = performance.now();
	const bufferLinesBefore = entry.xterm.buffer.active.length;
	const scrollPosBefore = entry.xterm.buffer.active.viewportY;

	container.appendChild(entry.wrapper);
	entry.fitAddon.fit();
	// Repaint after reattach — critical for WebGL renderer which may have
	// skipped frames while the wrapper was detached from the DOM.
	entry.xterm.refresh(0, Math.max(0, entry.xterm.rows - 1));
	entry.rendererRef.current.clearTextureAtlas?.();

	if (DEBUG_TERMINAL) {
		const elapsed = (performance.now() - t0).toFixed(1);
		console.log(
			`[v1-terminal-cache] attachToContainer: ${paneId} (${elapsed}ms, cols=${entry.xterm.cols}x${entry.xterm.rows}, renderer=${entry.rendererRef.current.kind}, bufferLines=${bufferLinesBefore}, scrollY=${scrollPosBefore})`,
		);
	}
}

/**
 * Remove the wrapper from its current DOM container but keep the
 * xterm instance alive in memory. Buffer and scroll position are
 * preserved.
 */
export function detachFromContainer(paneId: string): void {
	const entry = cache.get(paneId);
	if (!entry) return;

	if (DEBUG_TERMINAL) {
		const buf = entry.xterm.buffer.active;
		console.log(
			`[v1-terminal-cache] Detaching from DOM: ${paneId} (bufferLines=${buf.length}, scrollY=${buf.viewportY}, baseY=${buf.baseY})`,
		);
	}

	entry.wrapper.remove();
}

/**
 * Fully dispose the cached terminal: cleanup creation resources,
 * dispose xterm, and remove from cache.
 */
export function dispose(paneId: string): void {
	const entry = cache.get(paneId);
	if (!entry) return;

	entry.cleanupCreation();
	entry.xterm.dispose();
	cache.delete(paneId);

	if (DEBUG_TERMINAL) {
		const { size, creates, reattaches } = stats();
		console.log(
			`[v1-terminal-cache] Disposed: ${paneId} (remaining cache size=${size}, lifetime creates=${creates}, reattaches=${reattaches})`,
		);
	}
}

// Preserve cache across Vite HMR in dev so active terminals aren't orphaned.
const hot = import.meta.hot;
if (hot) {
	const existing = hot.data.v1TerminalCache as
		| Map<string, CachedTerminal>
		| undefined;
	if (existing) {
		for (const [k, v] of existing) {
			cache.set(k, v);
		}
	}
	hot.data.v1TerminalCache = cache;
}
