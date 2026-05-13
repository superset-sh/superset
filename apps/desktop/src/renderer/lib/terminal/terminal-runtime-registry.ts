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
	focusRuntime,
	type TerminalRuntime,
	updateRuntimeAppearance,
	writeRuntimeOutput,
} from "./terminal-runtime";
import { isTerminalWebglCanvas } from "./terminal-webgl-addon-controller";
import {
	type ConnectionState,
	clearLogs,
	connect,
	createTransport,
	disposeTransport,
	sendDispose,
	sendInput,
	sendResize,
	type TerminalLogEntry,
	type TerminalTransport,
} from "./terminal-ws-transport";

interface RegistryEntry {
	terminalId: string;
	instanceId: string;
	runtime: TerminalRuntime | null;
	transport: TerminalTransport;
	linkManager: TerminalLinkManager | null;
	/** Stored until linkManager is created (mount called after setLinkHandlers). */
	pendingLinkHandlers: TerminalLinkHandlers | null;
}

export interface TerminalWebglContextLossResult {
	terminalCount: number;
	canvasCount: number;
	webglContextCount: number;
	lostContextCount: number;
	unsupportedContextCount: number;
}

export interface TerminalRuntimeStressDebugInfo {
	terminalId: string;
	instanceId: string;
	hasRuntime: boolean;
	isAttached: boolean;
	isParked: boolean;
	cols: number | null;
	rows: number | null;
	canvasCount: number;
	connectionState: ConnectionState;
}

interface WebglLoseContextExtension {
	loseContext: () => void;
}

function getTerminalWebglContext(
	canvas: HTMLCanvasElement,
): WebGL2RenderingContext | null {
	if (!isTerminalWebglCanvas(canvas)) return null;
	return canvas.getContext("webgl2") as WebGL2RenderingContext | null;
}

function forceRuntimeWebglContextLoss(
	runtime: TerminalRuntime,
): Omit<TerminalWebglContextLossResult, "terminalCount"> {
	const canvases = Array.from(runtime.wrapper.querySelectorAll("canvas"));
	let webglContextCount = 0;
	let lostContextCount = 0;
	let unsupportedContextCount = 0;

	for (const canvas of canvases) {
		const context = getTerminalWebglContext(canvas);
		if (!context) continue;

		webglContextCount += 1;
		const extension = context.getExtension(
			"WEBGL_lose_context",
		) as WebglLoseContextExtension | null;

		if (!extension) {
			unsupportedContextCount += 1;
			continue;
		}

		try {
			extension.loseContext();
			lostContextCount += 1;
		} catch {
			unsupportedContextCount += 1;
		}
	}

	return {
		canvasCount: canvases.length,
		webglContextCount,
		lostContextCount,
		unsupportedContextCount,
	};
}

class TerminalRuntimeRegistryImpl {
	private entries = new Map<string, RegistryEntry>();
	private entryKeysByTerminalId = new Map<string, Set<string>>();

	private getEntryKey(terminalId: string, instanceId = terminalId): string {
		return `${terminalId}\u0000${instanceId}`;
	}

	private getOrCreateEntry(
		terminalId: string,
		instanceId = terminalId,
	): RegistryEntry {
		const key = this.getEntryKey(terminalId, instanceId);
		let entry = this.entries.get(key);
		if (entry) return entry;

		entry = {
			terminalId,
			instanceId,
			runtime: null,
			transport: createTransport(),
			linkManager: null,
			pendingLinkHandlers: null,
		};

		this.entries.set(key, entry);
		let keys = this.entryKeysByTerminalId.get(terminalId);
		if (!keys) {
			keys = new Set();
			this.entryKeysByTerminalId.set(terminalId, keys);
		}
		keys.add(key);
		return entry;
	}

	private getEntry(
		terminalId: string,
		instanceId?: string,
	): RegistryEntry | null {
		if (instanceId) {
			return this.entries.get(this.getEntryKey(terminalId, instanceId)) ?? null;
		}
		return this.getPrimaryEntry(terminalId);
	}

	private getPrimaryEntry(terminalId: string): RegistryEntry | null {
		const defaultEntry = this.entries.get(this.getEntryKey(terminalId));
		if (defaultEntry) return defaultEntry;

		const keys = this.entryKeysByTerminalId.get(terminalId);
		const firstKey = keys?.values().next().value;
		return firstKey ? (this.entries.get(firstKey) ?? null) : null;
	}

	private getEntries(terminalId: string): RegistryEntry[] {
		const keys = this.entryKeysByTerminalId.get(terminalId);
		if (!keys) return [];
		return Array.from(keys)
			.map((key) => this.entries.get(key))
			.filter((entry): entry is RegistryEntry => Boolean(entry));
	}

	private listEntries(
		terminalId?: string,
		instanceId?: string,
	): RegistryEntry[] {
		if (terminalId && instanceId) {
			const entry = this.getEntry(terminalId, instanceId);
			return entry ? [entry] : [];
		}
		if (terminalId) return this.getEntries(terminalId);
		if (instanceId) return [];
		return Array.from(this.entries.values());
	}

	private deleteEntry(entry: RegistryEntry) {
		const key = this.getEntryKey(entry.terminalId, entry.instanceId);
		this.entries.delete(key);
		const keys = this.entryKeysByTerminalId.get(entry.terminalId);
		if (!keys) return;
		keys.delete(key);
		if (keys.size === 0) {
			this.entryKeysByTerminalId.delete(entry.terminalId);
		}
	}

	private serializeExistingRuntime(
		terminalId: string,
		excludedInstanceId: string,
	): string | undefined {
		for (const entry of this.getEntries(terminalId)) {
			if (entry.instanceId === excludedInstanceId || !entry.runtime) continue;
			try {
				return entry.runtime.serializeAddon.serialize({ scrollback: 1000 });
			} catch {
				return undefined;
			}
		}
		return undefined;
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
		instanceId = terminalId,
	) {
		const entry = this.getOrCreateEntry(terminalId, instanceId);

		if (!entry.runtime) {
			entry.runtime = createRuntime(terminalId, appearance, {
				initialBuffer: this.serializeExistingRuntime(terminalId, instanceId),
			});
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
	 * The server session must already exist; the WebSocket route only attaches
	 * this xterm instance to the terminal id.
	 *
	 * Idempotent: no-op if already connected/connecting to the same URL.
	 */
	connect(terminalId: string, wsUrl: string, instanceId = terminalId) {
		const entry = this.getEntry(terminalId, instanceId);
		if (!entry?.runtime) return;
		const { runtime } = entry;
		connect(entry.transport, runtime.terminal, wsUrl, (data) => {
			writeRuntimeOutput(runtime, data);
		});
	}

	/**
	 * Swap the transport onto a new URL when it's already been brought up
	 * once. Used by effects watching `websocketUrl` — they fire on initial
	 * mount when the transport is still `"disconnected"` and the mount effect
	 * owns the initial connect.
	 *
	 * Skipped states: `"disconnected"` (never opened; caller should use
	 * `connect()` from the mount path). Allowed states: `"connecting"` (connect()
	 * cleanly aborts the in-flight socket), `"open"` (standard swap), and
	 * `"closed"` (previously live and mid-auto-reconnect — swap the URL so the
	 * reconnect targets the new endpoint).
	 */
	reconnect(terminalId: string, wsUrl: string, instanceId = terminalId) {
		const entry = this.getEntry(terminalId, instanceId);
		if (!entry?.runtime) return;
		if (entry.transport.connectionState === "disconnected") return;
		if (entry.transport.currentUrl === wsUrl) return;
		const { runtime } = entry;
		connect(entry.transport, runtime.terminal, wsUrl, (data) => {
			writeRuntimeOutput(runtime, data);
		});
	}

	/**
	 * Set link handler callbacks for a terminal. Safe to call before or after
	 * mount(). If the runtime already exists, link providers are re-registered.
	 */
	setLinkHandlers(
		terminalId: string,
		handlers: TerminalLinkHandlers,
		instanceId = terminalId,
	) {
		const entry = this.getOrCreateEntry(terminalId, instanceId);
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
	detach(terminalId: string, instanceId = terminalId) {
		const entry = this.getEntry(terminalId, instanceId);
		if (!entry?.runtime) return;

		detachFromContainer(entry.runtime);
	}

	focus(terminalId: string, instanceId = terminalId) {
		const entry = this.getEntry(terminalId, instanceId);
		if (!entry?.runtime) return;

		focusRuntime(entry.runtime);
	}

	updateAppearance(
		terminalId: string,
		appearance: TerminalAppearance,
		instanceId = terminalId,
	) {
		const entry = this.getEntry(terminalId, instanceId);
		if (!entry?.runtime) return;

		const prevCols = entry.runtime.terminal.cols;
		const prevRows = entry.runtime.terminal.rows;

		updateRuntimeAppearance(entry.runtime, appearance);

		const { cols, rows } = entry.runtime.terminal;
		if (cols !== prevCols || rows !== prevRows) {
			sendResize(entry.transport, cols, rows);
		}
	}

	private disposeEntry(
		entry: RegistryEntry,
		options: { clearPersistedState?: boolean } = {},
	) {
		entry.linkManager?.dispose();
		disposeTransport(entry.transport);
		if (entry.runtime) {
			disposeRuntime(entry.runtime, options);
		}
		this.deleteEntry(entry);
	}

	/**
	 * Release the renderer-side terminal runtime only. This detaches the xterm
	 * view and closes the WebSocket, but it does not tell host-service to kill
	 * the underlying PTY. Use this for pane/sidebar lifecycle cleanup.
	 */
	release(terminalId: string, instanceId?: string) {
		const entries = instanceId
			? [this.getEntry(terminalId, instanceId)].filter(
					(entry): entry is RegistryEntry => Boolean(entry),
				)
			: this.getEntries(terminalId);
		for (const entry of entries) {
			this.disposeEntry(entry, { clearPersistedState: false });
		}
	}

	/**
	 * Kill the host-service terminal session and remove all renderer-side state.
	 * This is destructive and should only be used from explicit kill actions.
	 */
	dispose(terminalId: string) {
		for (const entry of this.getEntries(terminalId)) {
			sendDispose(entry.transport);
			this.disposeEntry(entry);
		}
	}

	getSelection(terminalId: string, instanceId?: string): string {
		const entry = this.getEntry(terminalId, instanceId);
		return entry?.runtime?.terminal.getSelection() ?? "";
	}

	clear(terminalId: string, instanceId?: string): void {
		const entry = this.getEntry(terminalId, instanceId);
		entry?.runtime?.terminal.clear();
	}

	scrollToBottom(terminalId: string, instanceId?: string): void {
		const entry = this.getEntry(terminalId, instanceId);
		entry?.runtime?.terminal.scrollToBottom();
	}

	paste(terminalId: string, text: string, instanceId?: string): void {
		const entry = this.getEntry(terminalId, instanceId);
		entry?.runtime?.terminal.paste(text);
	}

	/** Send raw input to the terminal via the WebSocket transport (bypasses xterm). */
	writeInput(terminalId: string, data: string, instanceId?: string): void {
		const entry = this.getEntry(terminalId, instanceId);
		if (!entry) return;
		sendInput(entry.transport, data);
	}

	writeForStress(
		terminalId: string,
		data: string,
		instanceId?: string,
		timeoutMs = 5000,
	): Promise<boolean> {
		const entry = this.getEntry(terminalId, instanceId);
		if (!entry?.runtime) return Promise.resolve(false);
		const { runtime } = entry;

		return new Promise<boolean>((resolve) => {
			let settled = false;
			let timeoutId: ReturnType<typeof setTimeout> | null = null;
			const settle = (value: boolean) => {
				if (settled) return;
				settled = true;
				if (timeoutId !== null) {
					clearTimeout(timeoutId);
				}
				resolve(value);
			};

			timeoutId = setTimeout(() => settle(false), timeoutMs);
			try {
				writeRuntimeOutput(runtime, data);
				queueMicrotask(() => settle(true));
			} catch {
				settle(false);
			}
		});
	}

	forceWebglContextLossForStress(
		terminalId?: string,
		instanceId?: string,
	): TerminalWebglContextLossResult {
		const result: TerminalWebglContextLossResult = {
			terminalCount: 0,
			canvasCount: 0,
			webglContextCount: 0,
			lostContextCount: 0,
			unsupportedContextCount: 0,
		};

		for (const entry of this.listEntries(terminalId, instanceId)) {
			if (!entry.runtime) continue;
			result.terminalCount += 1;
			const runtimeResult = forceRuntimeWebglContextLoss(entry.runtime);
			result.canvasCount += runtimeResult.canvasCount;
			result.webglContextCount += runtimeResult.webglContextCount;
			result.lostContextCount += runtimeResult.lostContextCount;
			result.unsupportedContextCount += runtimeResult.unsupportedContextCount;
		}

		return result;
	}

	getStressDebugInfo(
		terminalId?: string,
		instanceId?: string,
	): TerminalRuntimeStressDebugInfo[] {
		return this.listEntries(terminalId, instanceId).map((entry) => {
			const runtime = entry.runtime;
			return {
				terminalId: entry.terminalId,
				instanceId: entry.instanceId,
				hasRuntime: Boolean(runtime),
				isAttached: Boolean(runtime?.container),
				isParked: Boolean(
					runtime && !runtime.container && runtime.wrapper.isConnected,
				),
				cols: runtime?.terminal.cols ?? null,
				rows: runtime?.terminal.rows ?? null,
				canvasCount: runtime
					? runtime.wrapper.querySelectorAll("canvas").length
					: 0,
				connectionState: entry.transport.connectionState,
			};
		});
	}

	findNext(terminalId: string, query: string, instanceId?: string): boolean {
		const entry = this.getEntry(terminalId, instanceId);
		return entry?.runtime?.searchAddon?.findNext(query) ?? false;
	}

	findPrevious(
		terminalId: string,
		query: string,
		instanceId?: string,
	): boolean {
		const entry = this.getEntry(terminalId, instanceId);
		return entry?.runtime?.searchAddon?.findPrevious(query) ?? false;
	}

	clearSearch(terminalId: string, instanceId?: string): void {
		const entry = this.getEntry(terminalId, instanceId);
		entry?.runtime?.searchAddon?.clearDecorations();
	}

	getTerminal(terminalId: string, instanceId?: string) {
		return this.getEntry(terminalId, instanceId)?.runtime?.terminal ?? null;
	}

	getDimensions(
		terminalId: string,
		instanceId?: string,
	): { cols: number; rows: number } | null {
		const terminal = this.getTerminal(terminalId, instanceId);
		return terminal ? { cols: terminal.cols, rows: terminal.rows } : null;
	}

	getSearchAddon(terminalId: string, instanceId?: string): SearchAddon | null {
		return this.getEntry(terminalId, instanceId)?.runtime?.searchAddon ?? null;
	}

	getProgressAddon(
		terminalId: string,
		instanceId?: string,
	): ProgressAddon | null {
		return (
			this.getEntry(terminalId, instanceId)?.runtime?.progressAddon ?? null
		);
	}

	getAllTerminalIds(): Set<string> {
		return new Set(this.entryKeysByTerminalId.keys());
	}

	has(terminalId: string): boolean {
		return this.entryKeysByTerminalId.has(terminalId);
	}

	getConnectionState(terminalId: string, instanceId?: string): ConnectionState {
		return (
			this.getEntry(terminalId, instanceId)?.transport.connectionState ??
			"disconnected"
		);
	}

	getTitle(terminalId: string, instanceId?: string): string | null | undefined {
		return this.getEntry(terminalId, instanceId)?.transport.title;
	}

	getLogs(
		terminalId: string,
		instanceId?: string,
	): readonly TerminalLogEntry[] {
		return this.getEntry(terminalId, instanceId)?.transport.logs ?? EMPTY_LOGS;
	}

	clearLogs(terminalId: string, instanceId?: string): void {
		const entry = this.getEntry(terminalId, instanceId);
		if (!entry) return;
		clearLogs(entry.transport);
	}

	onStateChange(
		terminalId: string,
		listener: () => void,
		instanceId = terminalId,
	): () => void {
		const entry = this.getOrCreateEntry(terminalId, instanceId);
		entry.transport.stateListeners.add(listener);
		return () => {
			entry.transport.stateListeners.delete(listener);
		};
	}

	onTitleChange(
		terminalId: string,
		listener: () => void,
		instanceId = terminalId,
	): () => void {
		const entry = this.getOrCreateEntry(terminalId, instanceId);
		entry.transport.titleListeners.add(listener);
		return () => {
			entry.transport.titleListeners.delete(listener);
		};
	}

	onLogsChange(
		terminalId: string,
		listener: () => void,
		instanceId = terminalId,
	): () => void {
		const entry = this.getOrCreateEntry(terminalId, instanceId);
		entry.transport.logListeners.add(listener);
		return () => {
			entry.transport.logListeners.delete(listener);
		};
	}
}

// Stable empty reference so useSyncExternalStore on a missing entry doesn't
// thrash from getSnapshot returning a fresh array each call.
const EMPTY_LOGS: readonly TerminalLogEntry[] = Object.freeze(
	[],
) as readonly [];

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

export type {
	ConnectionState,
	LinkHoverInfo,
	TerminalLinkHandlers,
	TerminalLogEntry,
};
