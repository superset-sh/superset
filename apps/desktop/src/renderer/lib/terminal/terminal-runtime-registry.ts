import type { TerminalAppearance } from "./appearance";
import type { DetectedLink } from "./links";
import {
	LinkDetectorAdapter,
	LocalLinkDetector,
	TerminalLinkResolver,
	type StatCallback,
} from "./links";
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

/**
 * Link handler callbacks for the v2 terminal.
 */
export interface TerminalLinkHandlers {
	/** Called when a file path link is activated (Cmd/Ctrl+click). */
	onFileLinkClick?: (
		event: MouseEvent,
		link: DetectedLink,
	) => void;
	/** Called when a URL link is activated. */
	onUrlClick?: (url: string) => void;
	/** Stat callback to validate file paths exist (called from main process). */
	stat?: StatCallback;
	/** The initial CWD for resolving relative paths. */
	initialCwd?: string;
	/** The user's home directory for resolving ~ paths. */
	userHome?: string;
}

interface RegistryEntry {
	runtime: TerminalRuntime | null;
	transport: TerminalTransport;
	linkHandlers?: TerminalLinkHandlers;
}

class TerminalRuntimeRegistryImpl {
	private entries = new Map<string, RegistryEntry>();

	private getOrCreateEntry(terminalId: string): RegistryEntry {
		let entry = this.entries.get(terminalId);
		if (entry) return entry;

		entry = {
			runtime: null,
			transport: createTransport(),
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
			// Register link providers on first creation
			this._registerLinkProviders(entry);
		} else {
			// Runtime already exists (reattach) — apply current appearance so
			// the first fit uses up-to-date font metrics.
			updateRuntimeAppearance(entry.runtime, appearance);
		}

		const { runtime, transport } = entry;

		attachToContainer(runtime, container, () => {
			sendResize(transport, runtime.terminal.cols, runtime.terminal.rows);
		});

		connect(transport, runtime.terminal, wsUrl);
	}

	/**
	 * Set link handler callbacks for a terminal. Should be called before or
	 * after attach() — if the runtime already exists, link providers are
	 * re-registered with the new handlers.
	 */
	setLinkHandlers(terminalId: string, handlers: TerminalLinkHandlers) {
		const entry = this.getOrCreateEntry(terminalId);
		entry.linkHandlers = handlers;
		if (entry.runtime) {
			this._registerLinkProviders(entry);
		}
	}

	private _registerLinkProviders(entry: RegistryEntry) {
		const { runtime, linkHandlers } = entry;
		if (!runtime || !linkHandlers?.stat) return;

		const terminal = runtime.terminal;
		const resolver = new TerminalLinkResolver(linkHandlers.stat);
		const detector = new LocalLinkDetector(resolver, {
			initialCwd: linkHandlers.initialCwd,
			userHome: linkHandlers.userHome,
		});

		const adapter = new LinkDetectorAdapter(
			terminal,
			detector,
			linkHandlers.onFileLinkClick,
		);
		terminal.registerLinkProvider(adapter);

		// URL link provider is registered separately via the existing
		// UrlLinkProvider from the v1 link-providers module, which handles
		// hard-wrapped URLs. That registration should be done by the caller
		// (TerminalPane) since it needs access to app-level URL open logic.
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

		// Font changes can alter the grid size — forward to the PTY so the
		// backend shell and TUIs see the correct cols/rows.
		const { cols, rows } = entry.runtime.terminal;
		if (cols !== prevCols || rows !== prevRows) {
			sendResize(entry.transport, cols, rows);
		}
	}

	dispose(terminalId: string) {
		const entry = this.entries.get(terminalId);
		if (!entry) return;

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

export const terminalRuntimeRegistry = new TerminalRuntimeRegistryImpl();

export type { ConnectionState };
