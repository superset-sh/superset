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

import { EventEmitter } from "node:events";
import type { DaemonTerminalManager } from "../terminal";
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
class LocalTerminalRuntime extends EventEmitter implements TerminalRuntime {
	private backend: DaemonTerminalManager | null = null;
	private readonly forwardedEvents = new Map<
		string | symbol,
		(...args: unknown[]) => void
	>();

	readonly management: TerminalManagement;
	readonly capabilities: TerminalCapabilities;

	constructor(private readonly getBackend: () => DaemonTerminalManager) {
		super();

		// Capabilities are always daemon-backed
		this.capabilities = {
			persistent: true,
			coldRestore: true,
		};

		this.management = {
			listSessions: () => this.ensureBackend().listDaemonSessions(),
			killAllSessions: () => this.ensureBackend().forceKillAll(),
			resetHistoryPersistence: () =>
				this.ensureBackend().resetHistoryPersistence(),
		};
	}

	private ensureBackend(): DaemonTerminalManager {
		if (!this.backend) {
			this.backend = this.getBackend();
			this.bridgeExistingListenerEvents();
		}
		return this.backend;
	}

	private bridgeExistingListenerEvents(): void {
		for (const event of this.eventNames()) {
			this.ensureForwarder(event);
		}
	}

	private ensureForwarder(event: string | symbol): void {
		if (!this.backend || this.forwardedEvents.has(event)) return;

		const forwarder = (...args: unknown[]) => {
			super.emit(event, ...args);
		};
		this.forwardedEvents.set(event, forwarder);
		this.backend.on(event, forwarder);
	}

	private removeForwarder(event: string | symbol): void {
		if (!this.backend) return;
		const forwarder = this.forwardedEvents.get(event);
		if (!forwarder) return;

		this.backend.off(event, forwarder);
		this.forwardedEvents.delete(event);
	}

	private detachForwarders(): void {
		if (!this.backend) {
			this.forwardedEvents.clear();
			return;
		}

		for (const event of Array.from(this.forwardedEvents.keys())) {
			this.removeForwarder(event);
		}
	}

	private isTerminalRuntimeEvent(event: string | symbol): boolean {
		const name = String(event);
		return (
			name.startsWith("data:") ||
			name.startsWith("exit:") ||
			name.startsWith("disconnect:") ||
			name.startsWith("error:") ||
			name === "terminalExit"
		);
	}

	// ===========================================================================
	// Session Operations (delegate to backend)
	// ===========================================================================

	createOrAttach: TerminalRuntime["createOrAttach"] = (params) => {
		return this.ensureBackend().createOrAttach(params);
	};

	cancelCreateOrAttach: TerminalRuntime["cancelCreateOrAttach"] = (params) => {
		this.ensureBackend().cancelCreateOrAttach(params);
	};

	write: TerminalRuntime["write"] = (params) => {
		return this.ensureBackend().write(params);
	};

	resize: TerminalRuntime["resize"] = (params) => {
		return this.ensureBackend().resize(params);
	};

	signal: TerminalRuntime["signal"] = (params) => {
		return this.ensureBackend().signal(params);
	};

	kill: TerminalRuntime["kill"] = (params) => {
		return this.ensureBackend().kill(params);
	};

	detach: TerminalRuntime["detach"] = (params) => {
		return this.ensureBackend().detach(params);
	};

	clearScrollback: TerminalRuntime["clearScrollback"] = (params) => {
		return this.ensureBackend().clearScrollback(params);
	};

	ackColdRestore: TerminalRuntime["ackColdRestore"] = (paneId) => {
		return this.ensureBackend().ackColdRestore(paneId);
	};

	getSession: TerminalRuntime["getSession"] = (paneId) => {
		return this.ensureBackend().getSession(paneId);
	};

	// ===========================================================================
	// Workspace Operations (delegate to backend)
	// ===========================================================================

	killByWorkspaceId: TerminalRuntime["killByWorkspaceId"] = (workspaceId) => {
		return this.ensureBackend().killByWorkspaceId(workspaceId);
	};

	getSessionCountByWorkspaceId: TerminalRuntime["getSessionCountByWorkspaceId"] =
		(workspaceId) => {
			return this.ensureBackend().getSessionCountByWorkspaceId(workspaceId);
		};

	refreshPromptsForWorkspace: TerminalRuntime["refreshPromptsForWorkspace"] = (
		workspaceId,
	) => {
		return this.ensureBackend().refreshPromptsForWorkspace(workspaceId);
	};

	// ===========================================================================
	// Event Source (bridge backend EventEmitter lazily)
	// ===========================================================================

	on(event: string | symbol, listener: (...args: unknown[]) => void): this {
		super.on(event, listener);
		this.ensureForwarder(event);
		return this;
	}

	off(event: string | symbol, listener: (...args: unknown[]) => void): this {
		super.off(event, listener);
		if (this.listenerCount(event) === 0) {
			this.removeForwarder(event);
		}
		return this;
	}

	once(event: string | symbol, listener: (...args: unknown[]) => void): this {
		super.once(event, listener);
		this.ensureForwarder(event);
		return this;
	}

	addListener(
		event: string | symbol,
		listener: (...args: unknown[]) => void,
	): this {
		super.addListener(event, listener);
		this.ensureForwarder(event);
		return this;
	}

	removeListener(
		event: string | symbol,
		listener: (...args: unknown[]) => void,
	): this {
		super.removeListener(event, listener);
		if (this.listenerCount(event) === 0) {
			this.removeForwarder(event);
		}
		return this;
	}

	removeAllListeners(event?: string | symbol): this {
		if (event) {
			super.removeAllListeners(event);
			this.removeForwarder(event);
			return this;
		}

		super.removeAllListeners();
		this.detachForwarders();
		return this;
	}

	prependListener(
		event: string | symbol,
		listener: (...args: unknown[]) => void,
	): this {
		super.prependListener(event, listener);
		this.ensureForwarder(event);
		return this;
	}

	prependOnceListener(
		event: string | symbol,
		listener: (...args: unknown[]) => void,
	): this {
		super.prependOnceListener(event, listener);
		this.ensureForwarder(event);
		return this;
	}

	detachAllListeners(): void {
		for (const event of this.eventNames()) {
			if (this.isTerminalRuntimeEvent(event)) {
				super.removeAllListeners(event);
				this.removeForwarder(event);
			}
		}
		this.backend?.detachAllListeners();
	}

	// ===========================================================================
	// Cleanup
	// ===========================================================================

	cleanup: TerminalRuntime["cleanup"] = () => {
		if (!this.backend) return Promise.resolve();
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

	constructor(getTerminalBackend: () => DaemonTerminalManager) {
		this.id = "local";

		// Create terminal runtime adapter
		this.terminal = new LocalTerminalRuntime(getTerminalBackend);

		// Aggregate capabilities
		this.capabilities = {
			terminal: this.terminal.capabilities,
		};
	}
}
