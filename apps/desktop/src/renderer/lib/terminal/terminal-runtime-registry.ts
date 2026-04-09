import type { TerminalAppearance } from "./appearance";
import {
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
	sendResize,
	type TerminalTransport,
} from "./terminal-ws-transport";

interface RegistryEntry {
	runtime: TerminalRuntime | null;
	transport: TerminalTransport;
	linkManager: TerminalLinkManager | null;
	/** Stored until linkManager is created (attach called after setLinkHandlers). */
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

	attach(
		terminalId: string,
		container: HTMLDivElement,
		wsUrl: string,
		appearance: TerminalAppearance,
	) {
		const entry = this.getOrCreateEntry(terminalId);

		if (!entry.runtime) {
			entry.runtime = createRuntime(terminalId, appearance);
			entry.linkManager = new TerminalLinkManager(entry.runtime.terminal);
			// Apply pending handlers if setLinkHandlers was called before attach
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

		connect(transport, runtime.terminal, wsUrl);
	}

	/**
	 * Set link handler callbacks for a terminal. Safe to call before or after
	 * attach(). If the runtime already exists, link providers are re-registered.
	 */
	setLinkHandlers(terminalId: string, handlers: TerminalLinkHandlers) {
		const entry = this.getOrCreateEntry(terminalId);
		if (entry.linkManager) {
			entry.linkManager.setHandlers(handlers);
		} else {
			entry.pendingLinkHandlers = handlers;
		}
	}

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

export type { ConnectionState, TerminalLinkHandlers };
