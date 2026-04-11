import type { Unsubscribable } from "@trpc/server/observable";
import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal as XTerm } from "@xterm/xterm";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { DEBUG_TERMINAL } from "./config";
import {
	type CreateTerminalOptions,
	createTerminalInWrapper,
	type TerminalRendererRef,
} from "./helpers";
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
	rendererRef: TerminalRendererRef;
	wrapper: HTMLDivElement;
	/** Disposes renderer RAF, query suppression, GPU renderer, etc. */
	cleanupCreation: () => void;

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
}

const cache = new Map<string, CachedTerminal>();

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

	const { xterm, fitAddon, searchAddon, renderer, wrapper, cleanup } =
		createTerminalInWrapper(options);

	const entry: CachedTerminal = {
		xterm,
		fitAddon,
		searchAddon,
		rendererRef: renderer,
		wrapper,
		cleanupCreation: cleanup,
		subscription: null,
		streamReady: false,
		pendingStreamEvents: [],
		pendingLifecycleEvents: [],
		eventHandler: null,
		subscriptionErrorHandler: null,
	};

	cache.set(paneId, entry);
	return entry;
}

// --- DOM attach / detach ---

export function attachToContainer(
	paneId: string,
	container: HTMLDivElement,
): void {
	const entry = cache.get(paneId);
	if (!entry) return;

	container.appendChild(entry.wrapper);
	entry.fitAddon.fit();
	entry.xterm.refresh(0, Math.max(0, entry.xterm.rows - 1));
	entry.rendererRef.current.clearTextureAtlas?.();
}

export function detachFromContainer(paneId: string): void {
	const entry = cache.get(paneId);
	if (!entry) return;

	if (DEBUG_TERMINAL) {
		console.log(`[v1-terminal-cache] detachFromContainer: ${paneId}`);
	}
	entry.wrapper.remove();
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
