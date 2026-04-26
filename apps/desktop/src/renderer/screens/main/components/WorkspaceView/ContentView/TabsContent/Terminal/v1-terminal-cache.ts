import type { Unsubscribable } from "@trpc/server/observable";
import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal as XTerm } from "@xterm/xterm";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { DEBUG_TERMINAL } from "./config";
import { type CreateTerminalOptions, createTerminalInWrapper } from "./helpers";
import type { TerminalStreamEvent } from "./types";

/**
 * Cached xterm instance that survives React mount/unmount cycles.
 * Borrows the wrapper-div pattern from v2's terminal-runtime.ts:
 * xterm is opened into a persistent wrapper <div> that can be
 * moved between DOM containers without disposing the terminal.
 *
 * Also owns the tRPC stream subscription so data continues flowing
 * to xterm even while the React component is unmounted (tab hidden).
 */
export interface CachedTerminal {
	xterm: XTerm;
	fitAddon: FitAddon;
	searchAddon: SearchAddon;
	wrapper: HTMLDivElement;
	/** Disposes renderer RAF, query suppression, GPU renderer, etc. */
	cleanupCreation: () => void;
	/** Last known dimensions — used to skip no-op resize events. */
	lastCols: number;
	lastRows: number;

	// --- Stream management ---

	/** The live tRPC subscription. Null until startStream() is called. */
	subscription: Unsubscribable | null;
	/** True once the first createOrAttach succeeds and the stream gate opens. */
	streamReady: boolean;
	/** Events queued before streamReady (first mount only). */
	pendingStreamEvents: TerminalStreamEvent[];
	/** Non-data events queued while no component is mounted. */
	pendingLifecycleEvents: TerminalStreamEvent[];
	/**
	 * Handler provided by the mounted Terminal component.
	 * When set, ALL events are forwarded here so the component can
	 * update React state (exit status, connection error, modes, cwd, etc.).
	 * When null (component unmounted), data events write directly to xterm
	 * and non-data events are queued.
	 */
	eventHandler: ((event: TerminalStreamEvent) => void) | null;
	/**
	 * Error handler for tRPC subscription-level errors (distinct from
	 * terminal stream error events).
	 */
	subscriptionErrorHandler: ((error: unknown) => void) | null;
	/** ResizeObserver for the attached container. Managed by attach/detach. */
	resizeObserver: ResizeObserver | null;
	/** Live container, when attached. */
	container: HTMLDivElement | null;
}

const cache = new Map<string, CachedTerminal>();

function hostIsVisible(container: HTMLDivElement | null): boolean {
	if (!container) return false;
	return container.clientWidth > 0 && container.clientHeight > 0;
}

function fitAndRefresh(entry: CachedTerminal): boolean {
	if (!hostIsVisible(entry.container)) return false;

	const { xterm } = entry;
	const buffer = xterm.buffer.active;
	const wasPinnedToBottom = buffer.viewportY >= buffer.baseY;
	const savedViewportY = buffer.viewportY;
	const prevCols = xterm.cols;
	const prevRows = xterm.rows;

	entry.fitAddon.fit();
	entry.lastCols = xterm.cols;
	entry.lastRows = xterm.rows;

	if (wasPinnedToBottom) {
		xterm.scrollToBottom();
	} else {
		const targetY = Math.min(savedViewportY, xterm.buffer.active.baseY);
		if (xterm.buffer.active.viewportY !== targetY) {
			xterm.scrollToLine(targetY);
		}
	}

	xterm.refresh(0, Math.max(0, xterm.rows - 1));

	return xterm.cols !== prevCols || xterm.rows !== prevRows;
}

export function has(paneId: string): boolean {
	return cache.has(paneId);
}

export function get(paneId: string): CachedTerminal | undefined {
	return cache.get(paneId);
}

export function getOrCreate(
	paneId: string,
	options: CreateTerminalOptions,
): CachedTerminal {
	const existing = cache.get(paneId);
	if (existing) return existing;

	if (DEBUG_TERMINAL) {
		console.log(`[v1-terminal-cache] Creating new terminal: ${paneId}`);
	}

	const { xterm, fitAddon, searchAddon, wrapper, cleanup } =
		createTerminalInWrapper(options);

	const entry: CachedTerminal = {
		xterm,
		fitAddon,
		searchAddon,
		wrapper,
		cleanupCreation: cleanup,
		subscription: null,
		streamReady: false,
		pendingStreamEvents: [],
		pendingLifecycleEvents: [],
		eventHandler: null,
		subscriptionErrorHandler: null,
		resizeObserver: null,
		container: null,
		lastCols: xterm.cols,
		lastRows: xterm.rows,
	};

	cache.set(paneId, entry);
	return entry;
}

// --- DOM attach / detach ---

export function attachToContainer(
	paneId: string,
	container: HTMLDivElement,
	onResize?: () => void,
): void {
	const entry = cache.get(paneId);
	if (!entry) return;

	entry.container = container;
	container.appendChild(entry.wrapper);

	fitAndRefresh(entry);

	// Manage ResizeObserver lifecycle in the cache, not in React.
	entry.resizeObserver?.disconnect();
	const observer = new ResizeObserver(() => {
		if (fitAndRefresh(entry)) {
			onResize?.();
		}
	});
	observer.observe(container);
	entry.resizeObserver = observer;
}

export function detachFromContainer(paneId: string): void {
	const entry = cache.get(paneId);
	if (!entry) return;

	if (DEBUG_TERMINAL) {
		console.log(`[v1-terminal-cache] detachFromContainer: ${paneId}`);
	}
	entry.resizeObserver?.disconnect();
	entry.resizeObserver = null;
	entry.container = null;
	entry.wrapper.remove();
}

// --- Appearance ---

/**
 * Update font settings on a cached terminal. If font changed and the
 * terminal is visible, re-fit and return true so the caller can send
 * a backend resize if needed.
 */
export function updateAppearance(
	paneId: string,
	fontFamily: string,
	fontSize: number,
): { cols: number; rows: number; changed: boolean } | null {
	const entry = cache.get(paneId);
	if (!entry) return null;

	const { xterm } = entry;
	const fontChanged =
		xterm.options.fontFamily !== fontFamily ||
		xterm.options.fontSize !== fontSize;
	if (!fontChanged) return null;

	xterm.options.fontFamily = fontFamily;
	xterm.options.fontSize = fontSize;

	const changed = fitAndRefresh(entry);

	return {
		cols: xterm.cols,
		rows: xterm.rows,
		changed,
	};
}

// --- Stream subscription ---

function routeEvent(entry: CachedTerminal, event: TerminalStreamEvent): void {
	// Before stream is ready: queue everything (first-mount gating).
	if (!entry.streamReady) {
		entry.pendingStreamEvents.push(event);
		return;
	}

	// Component mounted — forward all events there.
	if (entry.eventHandler) {
		entry.eventHandler(event);
		return;
	}

	// Component unmounted — write data directly to xterm, queue the rest.
	if (event.type === "data") {
		entry.xterm.write(event.data);
	} else {
		entry.pendingLifecycleEvents.push(event);
	}
}

/**
 * Start the tRPC stream subscription for this terminal.
 * Called once on first mount after createOrAttach succeeds.
 * The subscription stays alive across component mount/unmount cycles
 * and is only stopped on dispose().
 */
export function startStream(paneId: string): void {
	const entry = cache.get(paneId);
	if (!entry || entry.subscription) return;

	if (DEBUG_TERMINAL) {
		console.log(`[v1-terminal-cache] Starting stream: ${paneId}`);
	}

	entry.subscription = electronTrpcClient.terminal.stream.subscribe(paneId, {
		onData: (event: TerminalStreamEvent) => {
			routeEvent(entry, event);
		},
		onError: (error: unknown) => {
			// Subscription is dead after onError — null it so startStream()
			// can create a replacement on remount.
			entry.subscription = null;

			if (entry.subscriptionErrorHandler) {
				entry.subscriptionErrorHandler(error);
			} else if (DEBUG_TERMINAL) {
				console.error(
					`[v1-terminal-cache] Stream error (no handler): ${paneId}`,
					error,
				);
			}
		},
	});
}

/**
 * Mark the stream as ready and flush any events queued during the
 * first-mount gating period (before createOrAttach completed).
 */
export function setStreamReady(paneId: string): void {
	const entry = cache.get(paneId);
	if (!entry || entry.streamReady) return;

	if (DEBUG_TERMINAL) {
		console.log(
			`[v1-terminal-cache] Stream ready: ${paneId}, flushing ${entry.pendingStreamEvents.length} queued events`,
		);
	}

	entry.streamReady = true;
	const pending = entry.pendingStreamEvents.splice(0);
	for (const event of pending) {
		routeEvent(entry, event);
	}
}

/**
 * Register event handlers from the mounted Terminal component.
 * Returns any lifecycle events (exit, error, disconnect) that were
 * queued while the component was unmounted.
 */
export function registerHandlers(
	paneId: string,
	handlers: {
		onEvent: (event: TerminalStreamEvent) => void;
		onError: (error: unknown) => void;
	},
): TerminalStreamEvent[] {
	const entry = cache.get(paneId);
	if (!entry) return [];

	entry.eventHandler = handlers.onEvent;
	entry.subscriptionErrorHandler = handlers.onError;

	// Drain and return queued lifecycle events
	return entry.pendingLifecycleEvents.splice(0);
}

/**
 * Unregister the component's event handlers (component unmounting).
 * The subscription stays alive; data events write directly to xterm.
 */
export function unregisterHandlers(paneId: string): void {
	const entry = cache.get(paneId);
	if (!entry) return;

	entry.eventHandler = null;
	entry.subscriptionErrorHandler = null;
}

// --- Disposal ---

export function dispose(paneId: string): void {
	const entry = cache.get(paneId);
	if (!entry) return;

	if (DEBUG_TERMINAL) {
		console.log(`[v1-terminal-cache] Disposing: ${paneId}`);
	}

	entry.resizeObserver?.disconnect();
	entry.subscription?.unsubscribe();
	entry.cleanupCreation();
	entry.xterm.dispose();
	cache.delete(paneId);
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
