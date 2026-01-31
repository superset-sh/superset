/**
 * Local Workspace Runtime
 *
 * This is the local implementation of WorkspaceRuntime that wraps
 * either TerminalManager (in-process) or DaemonTerminalManager (daemon mode).
 *
 * Backend selection is done once at construction time based on settings.
 * The runtime caches the backend and exposes it through the provider-neutral
 * TerminalRuntime interface.
 */

import {
	DaemonTerminalManager,
	getDaemonTerminalManager,
	isDaemonModeEnabled,
	type TerminalManager,
	terminalManager,
} from "../terminal";
import type {
	TerminalCapabilities,
	TerminalManagement,
	TerminalRuntime,
	WorkspaceRuntime,
	WorkspaceRuntimeId,
} from "./types";

// =============================================================================
// Terminal Runtime Adapter
// =============================================================================

/**
 * Adapts TerminalManager or DaemonTerminalManager to the TerminalRuntime interface.
 *
 * This adapter:
 * 1. Wraps the underlying manager with the common interface
 * 2. Exposes management capabilities only when available (daemon mode)
 * 3. Provides capability flags for UI feature detection
 */
class LocalTerminalRuntime implements TerminalRuntime {
	private readonly backend: TerminalManager | DaemonTerminalManager;
	private readonly isDaemon: boolean;

	readonly management: TerminalManagement | null;
	readonly capabilities: TerminalCapabilities;

	constructor(backend: TerminalManager | DaemonTerminalManager) {
		this.backend = backend;
		this.isDaemon = backend instanceof DaemonTerminalManager;

		// Set up capabilities based on backend type
		this.capabilities = {
			persistent: this.isDaemon,
			coldRestore: this.isDaemon,
		};

		// Set up management only for daemon mode
		if (this.isDaemon) {
			const daemon = backend as DaemonTerminalManager;
			this.management = {
				listSessions: () => daemon.listDaemonSessions(),
				killAllSessions: () => daemon.forceKillAll(),
				resetHistoryPersistence: () => daemon.resetHistoryPersistence(),
			};
		} else {
			this.management = null;
		}
	}

	// ===========================================================================
	// Session Operations (delegate to backend)
	// ===========================================================================

	createOrAttach: TerminalRuntime["createOrAttach"] = (params) => {
		return this.backend.createOrAttach(params);
	};

	write: TerminalRuntime["write"] = (params) => {
		return this.backend.write(params);
	};

	resize: TerminalRuntime["resize"] = (params) => {
		return this.backend.resize(params);
	};

	signal: TerminalRuntime["signal"] = (params) => {
		return this.backend.signal(params);
	};

	kill: TerminalRuntime["kill"] = (params) => {
		return this.backend.kill(params);
	};

	detach: TerminalRuntime["detach"] = (params) => {
		return this.backend.detach(params);
	};

	clearScrollback: TerminalRuntime["clearScrollback"] = (params) => {
		return this.backend.clearScrollback(params);
	};

	ackColdRestore: TerminalRuntime["ackColdRestore"] = (paneId) => {
		return this.backend.ackColdRestore(paneId);
	};

	getSession: TerminalRuntime["getSession"] = (paneId) => {
		return this.backend.getSession(paneId);
	};

	// ===========================================================================
	// Workspace Operations (delegate to backend)
	// ===========================================================================

	killByWorkspaceId: TerminalRuntime["killByWorkspaceId"] = (workspaceId) => {
		return this.backend.killByWorkspaceId(workspaceId);
	};

	getSessionCountByWorkspaceId: TerminalRuntime["getSessionCountByWorkspaceId"] =
		(workspaceId) => {
			return this.backend.getSessionCountByWorkspaceId(workspaceId);
		};

	refreshPromptsForWorkspace: TerminalRuntime["refreshPromptsForWorkspace"] = (
		workspaceId,
	) => {
		return this.backend.refreshPromptsForWorkspace(workspaceId);
	};

	// ===========================================================================
	// Event Source (delegate to backend EventEmitter)
	// ===========================================================================

	// EventEmitter methods - delegate to backend
	// Use method syntax to preserve `this` return type correctly
	on(event: string | symbol, listener: (...args: unknown[]) => void): this {
		this.backend.on(event, listener);
		return this;
	}

	off(event: string | symbol, listener: (...args: unknown[]) => void): this {
		this.backend.off(event, listener);
		return this;
	}

	once(event: string | symbol, listener: (...args: unknown[]) => void): this {
		this.backend.once(event, listener);
		return this;
	}

	emit(event: string | symbol, ...args: unknown[]): boolean {
		return this.backend.emit(event, ...args);
	}

	addListener(
		event: string | symbol,
		listener: (...args: unknown[]) => void,
	): this {
		this.backend.addListener(event, listener);
		return this;
	}

	removeListener(
		event: string | symbol,
		listener: (...args: unknown[]) => void,
	): this {
		this.backend.removeListener(event, listener);
		return this;
	}

	removeAllListeners(event?: string | symbol): this {
		this.backend.removeAllListeners(event);
		return this;
	}

	setMaxListeners(n: number): this {
		this.backend.setMaxListeners(n);
		return this;
	}

	getMaxListeners(): number {
		return this.backend.getMaxListeners();
	}

	// biome-ignore lint/complexity/noBannedTypes: EventEmitter interface requires Function[]
	listeners(event: string | symbol): Function[] {
		return this.backend.listeners(event);
	}

	// biome-ignore lint/complexity/noBannedTypes: EventEmitter interface requires Function[]
	rawListeners(event: string | symbol): Function[] {
		return this.backend.rawListeners(event);
	}

	listenerCount(
		event: string | symbol,
		listener?: (...args: unknown[]) => void,
	): number {
		return this.backend.listenerCount(event, listener);
	}

	prependListener(
		event: string | symbol,
		listener: (...args: unknown[]) => void,
	): this {
		this.backend.prependListener(event, listener);
		return this;
	}

	prependOnceListener(
		event: string | symbol,
		listener: (...args: unknown[]) => void,
	): this {
		this.backend.prependOnceListener(event, listener);
		return this;
	}

	eventNames(): (string | symbol)[] {
		return this.backend.eventNames();
	}

	detachAllListeners(): void {
		this.backend.detachAllListeners();
	}

	// ===========================================================================
	// Cleanup
	// ===========================================================================

	cleanup: TerminalRuntime["cleanup"] = () => {
		return this.backend.cleanup();
	};
}

// =============================================================================
// Local Workspace Runtime
// =============================================================================

/**
 * Local workspace runtime implementation.
 *
 * This provides the WorkspaceRuntime interface for local workspaces,
 * wrapping the terminal manager (either in-process or daemon-based).
 */
export class LocalWorkspaceRuntime implements WorkspaceRuntime {
	readonly id: WorkspaceRuntimeId;
	readonly terminal: TerminalRuntime;
	readonly capabilities: WorkspaceRuntime["capabilities"];

	constructor() {
		this.id = "local";

		// Select backend based on daemon mode setting
		const backend = isDaemonModeEnabled()
			? getDaemonTerminalManager()
			: terminalManager;

		// Create terminal runtime adapter
		this.terminal = new LocalTerminalRuntime(backend);

		// Aggregate capabilities
		this.capabilities = {
			terminal: this.terminal.capabilities,
		};
	}
}
