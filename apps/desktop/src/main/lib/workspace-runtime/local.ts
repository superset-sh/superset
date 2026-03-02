/**
 * Local Workspace Runtime
 *
 * This is the local implementation of WorkspaceRuntime that wraps
 * DaemonTerminalManager (persistent terminals).
 *
 * Backend selection is fixed to the daemon-based manager.
 * The runtime caches the backend and exposes it through the provider-neutral
 * TerminalRuntime interface.
 */

import {
	type DaemonTerminalManager,
	getDaemonTerminalManager,
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
 * Adapts DaemonTerminalManager to the TerminalRuntime interface.
 *
 * This adapter:
 * 1. Wraps the underlying manager with the common interface
 * 2. Exposes management capabilities only when available (daemon mode)
 * 3. Provides capability flags for UI feature detection
 */
class LocalTerminalRuntime implements TerminalRuntime {
	private readonly backend: DaemonTerminalManager;

	readonly management: TerminalManagement;
	readonly capabilities: TerminalCapabilities;

	constructor(backend: DaemonTerminalManager) {
		this.backend = backend;

		// Capabilities are always daemon-backed
		this.capabilities = {
			persistent: true,
			coldRestore: true,
		};

		this.management = {
			listSessions: () => backend.listDaemonSessions(),
			killAllSessions: () => backend.forceKillAll(),
			resetHistoryPersistence: () => backend.resetHistoryPersistence(),
		};
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
 * wrapping the daemon-based terminal manager.
 */
export class LocalWorkspaceRuntime implements WorkspaceRuntime {
	readonly id: WorkspaceRuntimeId;
	readonly terminal: TerminalRuntime;
	readonly capabilities: WorkspaceRuntime["capabilities"];

	constructor() {
		this.id = "local";

		const backend = getDaemonTerminalManager();

		// Create terminal runtime adapter
		this.terminal = new LocalTerminalRuntime(backend);

		// Aggregate capabilities
		this.capabilities = {
			terminal: this.terminal.capabilities,
		};
	}
}
