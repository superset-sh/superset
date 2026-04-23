import type { ProgressAddon } from "@xterm/addon-progress";
import type { SearchAddon } from "@xterm/addon-search";
import type { TerminalAppearance } from "./appearance";
import {
	type LinkHoverInfo,
	type TerminalLinkHandlers,
	TerminalLinkManager,
} from "./terminal-link-manager";
import {
	attachToContainer,
	createRuntime,
	detachFromContainer,
	disposeRuntime,
	type TerminalRuntime,
	updateRuntimeAppearance,
} from "./terminal-runtime";
import {
	type ConnectionState,
	connect,
	createTransport,
	disposeTransport,
	sendDispose,
	sendInput,
	sendResize,
	type TerminalTransport,
} from "./terminal-ws-transport";

interface RegistryEntry {
	runtime: TerminalRuntime | null;
	transport: TerminalTransport;
	linkManager: TerminalLinkManager | null;
	/** Stored until linkManager is created (mount called after setLinkHandlers). */
	pendingLinkHandlers: TerminalLinkHandlers | null;
}

class TerminalRuntimeRegistryImpl {
	private entries = new Map<string, RegistryEntry>();

	private getOrCreateEntry(terminalId: string): RegistryEntry {
		let entry = this.entries.get(terminalId);
		if (entry) return entry;

		entry = {
			runtime: null,
			transport: createTransport(),
			linkManager: null,
			pendingLinkHandlers: null,
		};

		this.entries.set(terminalId, entry);
		return entry;
	}

	/**
	 * Ensure the xterm runtime exists and attach it to `container`.
	 * Synchronous. DOM-only — the WebSocket transport is untouched.
	 *
	 * Matches VSCode's pattern (`TerminalInstance.attachToElement`) and
	 * Tabby's (`XTermFrontend.attach`): the terminal renders immediately
	 * with a blank cursor, the backend pipe catches up via `connect()` once
	 * the caller has confirmed the server session exists. Decoupling the
	 * DOM from the transport is what lets a terminal survive workspace
	 * switches without an in-flight WebSocket being opened against a
	 * nonexistent session.
	 */
	mount(
		terminalId: string,
		container: HTMLDivElement,
		appearance: TerminalAppearance,
	) {
		const entry = this.getOrCreateEntry(terminalId);

		if (!entry.runtime) {
			entry.runtime = createRuntime(terminalId, appearance);
			entry.linkManager = new TerminalLinkManager(entry.runtime.terminal);
			if (entry.pendingLinkHandlers) {
				entry.linkManager.setHandlers(entry.pendingLinkHandlers);
				entry.pendingLinkHandlers = null;
			}
		} else {
			updateRuntimeAppearance(entry.runtime, appearance);
		}

		const { runtime, transport } = entry;
		attachToContainer(runtime, container, () => {
			sendResize(transport, runtime.terminal.cols, runtime.terminal.rows);
		});
	}

	/**
	 * Open (or re-use) the WebSocket transport for this terminal.
	 * Caller is responsible for ensuring the server session exists before
	 * calling — otherwise the server replies "Session not found".
	 *
	 * Idempotent: no-op if already connected/connecting to the same URL.
	 */
	connect(terminalId: string, wsUrl: string) {
		const entry = this.entries.get(terminalId);
		if (!entry?.runtime) return;
		connect(entry.transport, entry.runtime.terminal, wsUrl);
	}

	/**
	 * Swap the transport onto a new URL when it's already been brought up
	 * once. Used by effects watching `websocketUrl` — they fire on initial
	 * mount when the transport is still `"disconnected"` and ensureSession
	 * is in-flight, and we must not pre-empt that with a premature connect.
	 *
	 * Skipped states: `"disconnected"` (never opened; caller should use
	 * `connect()` via the ensureSession path). Allowed states: `"connecting"`
	 * (connect() cleanly aborts the in-flight socket), `"open"` (standard
	 * swap), and `"closed"` (previously live and mid-auto-reconnect — swap
	 * the URL so the reconnect targets the new endpoint).
	 */
	reconnect(terminalId: string, wsUrl: string) {
		const entry = this.entries.get(terminalId);
		if (!entry?.runtime) return;
		if (entry.transport.connectionState === "disconnected") return;
		if (entry.transport.currentUrl === wsUrl) return;
		connect(entry.transport, entry.runtime.terminal, wsUrl);
	}

	/**
	 * Set link handler callbacks for a terminal. Safe to call before or after
	 * mount(). If the runtime already exists, link providers are re-registered.
	 */
	setLinkHandlers(terminalId: string, handlers: TerminalLinkHandlers) {
		const entry = this.getOrCreateEntry(terminalId);
		if (entry.linkManager) {
			entry.linkManager.setHandlers(handlers);
		} else {
			entry.pendingLinkHandlers = handlers;
		}
	}

	/**
	 * Park the wrapper in the hidden body-level container. Runtime and
	 * transport stay alive; DOM is moved off the React-controlled tree so
	 * it survives the parent unmount without re-entering xterm.open().
	 */
	detach(terminalId: string) {
		const entry = this.entries.get(terminalId);
		if (!entry?.runtime) return;

		detachFromContainer(entry.runtime);
	}

	updateAppearance(terminalId: string, appearance: TerminalAppearance) {
		const entry = this.entries.get(terminalId);
		if (!entry?.runtime) return;

		const prevCols = entry.runtime.terminal.cols;
		const prevRows = entry.runtime.terminal.rows;

		updateRuntimeAppearance(entry.runtime, appearance);

		const { cols, rows } = entry.runtime.terminal;
		if (cols !== prevCols || rows !== prevRows) {
			sendResize(entry.transport, cols, rows);
		}
	}

	dispose(terminalId: string) {
		const entry = this.entries.get(terminalId);
		if (!entry) return;

		entry.linkManager?.dispose();

		sendDispose(entry.transport);
		disposeTransport(entry.transport);
		if (entry.runtime) disposeRuntime(entry.runtime);

		this.entries.delete(terminalId);
	}

	getSelection(terminalId: string): string {
		const entry = this.entries.get(terminalId);
		return entry?.runtime?.terminal.getSelection() ?? "";
	}

	clear(terminalId: string): void {
		const entry = this.entries.get(terminalId);
		entry?.runtime?.terminal.clear();
	}

	scrollToBottom(terminalId: string): void {
		const entry = this.entries.get(terminalId);
		entry?.runtime?.terminal.scrollToBottom();
	}

	paste(terminalId: string, text: string): void {
		const entry = this.entries.get(terminalId);
		entry?.runtime?.terminal.paste(text);
	}

	/** Send raw input to the terminal via the WebSocket transport (bypasses xterm). */
	writeInput(terminalId: string, data: string): void {
		const entry = this.entries.get(terminalId);
		if (!entry) return;
		sendInput(entry.transport, data);
	}

	findNext(terminalId: string, query: string): boolean {
		const entry = this.entries.get(terminalId);
		return entry?.runtime?.searchAddon?.findNext(query) ?? false;
	}

	findPrevious(terminalId: string, query: string): boolean {
		const entry = this.entries.get(terminalId);
		return entry?.runtime?.searchAddon?.findPrevious(query) ?? false;
	}

	clearSearch(terminalId: string): void {
		const entry = this.entries.get(terminalId);
		entry?.runtime?.searchAddon?.clearDecorations();
	}

	getTerminal(terminalId: string) {
		return this.entries.get(terminalId)?.runtime?.terminal ?? null;
	}

	getSearchAddon(terminalId: string): SearchAddon | null {
		return this.entries.get(terminalId)?.runtime?.searchAddon ?? null;
	}

	getProgressAddon(terminalId: string): ProgressAddon | null {
		return this.entries.get(terminalId)?.runtime?.progressAddon ?? null;
	}

	getAllTerminalIds(): Set<string> {
		return new Set(this.entries.keys());
	}

	has(terminalId: string): boolean {
		return this.entries.has(terminalId);
	}

	getConnectionState(terminalId: string): ConnectionState {
		return (
			this.entries.get(terminalId)?.transport.connectionState ?? "disconnected"
		);
	}

	onStateChange(terminalId: string, listener: () => void): () => void {
		const entry = this.getOrCreateEntry(terminalId);
		entry.transport.stateListeners.add(listener);
		return () => {
			entry.transport.stateListeners.delete(listener);
		};
	}
}

// In dev, preserve the singleton across Vite HMR so active WebSocket
// connections and xterm instances aren't orphaned on module re-evaluation.
// import.meta.hot is undefined in production so this is a plain `new` call.
export const terminalRuntimeRegistry: TerminalRuntimeRegistryImpl =
	(import.meta.hot?.data?.registry as
		| TerminalRuntimeRegistryImpl
		| undefined) ?? new TerminalRuntimeRegistryImpl();

if (import.meta.hot) {
	import.meta.hot.data.registry = terminalRuntimeRegistry;
}

export type { ConnectionState, LinkHoverInfo, TerminalLinkHandlers };
