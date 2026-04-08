import { UrlLinkProvider } from "../../screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/link-providers";
import type { TerminalAppearance } from "./appearance";
import type { DetectedLink } from "./links";
import {
	LinkDetectorAdapter,
	LocalLinkDetector,
	type StatCallback,
	TerminalLinkResolver,
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
	onFileLinkClick?: (event: MouseEvent, link: DetectedLink) => void;
	/** Called when a URL link is activated. */
	onUrlClick?: (url: string) => void;
	/** Stat callback to validate file paths exist (called from main process). */
	stat?: StatCallback;
	/** The initial CWD for resolving relative paths. */
	initialCwd?: string;
	/** The user's home directory for resolving ~ paths. */
	userHome?: string;
}

interface LinkProviderDisposable {
	dispose(): void;
}

interface RegistryEntry {
	runtime: TerminalRuntime | null;
	transport: TerminalTransport;
	linkHandlers?: TerminalLinkHandlers;
	/** Disposables for registered link providers (to avoid duplicates on re-register). */
	linkDisposables: LinkProviderDisposable[];
	/** Cached resolver instance (preserves stat cache across re-registrations). */
	linkResolver?: TerminalLinkResolver;
}

class TerminalRuntimeRegistryImpl {
	private entries = new Map<string, RegistryEntry>();

	private getOrCreateEntry(terminalId: string): RegistryEntry {
		let entry = this.entries.get(terminalId);
		if (entry) return entry;

		entry = {
			runtime: null,
			transport: createTransport(),
			linkDisposables: [],
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

		// Dispose old providers to prevent duplicates
		for (const d of entry.linkDisposables) d.dispose();
		entry.linkDisposables = [];

		const terminal = runtime.terminal;

		// Reuse resolver to preserve stat cache across re-registrations
		// (e.g. when initialCwd is updated after workspace.get resolves).
		// Only recreate if the stat callback changed.
		if (!entry.linkResolver) {
			entry.linkResolver = new TerminalLinkResolver(linkHandlers.stat);
		}

		const detector = new LocalLinkDetector(entry.linkResolver, {
			initialCwd: linkHandlers.initialCwd,
			userHome: linkHandlers.userHome,
		});

		const adapter = new LinkDetectorAdapter(
			terminal,
			detector,
			linkHandlers.onFileLinkClick,
		);
		entry.linkDisposables.push(terminal.registerLinkProvider(adapter));

		// Register the URL link provider (handles hard-wrapped URLs).
		// The UrlLinkProvider already gates activation on Cmd/Ctrl+click.
		if (linkHandlers.onUrlClick) {
			const onUrlClick = linkHandlers.onUrlClick;
			const urlProvider = new UrlLinkProvider(terminal, (_event, uri) => {
				onUrlClick(uri);
			});
			entry.linkDisposables.push(terminal.registerLinkProvider(urlProvider));
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

		for (const d of entry.linkDisposables) d.dispose();
		entry.linkDisposables = [];
		entry.linkResolver?.clearCache();

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

export const terminalRuntimeRegistry = new TerminalRuntimeRegistryImpl();

export type { ConnectionState };
