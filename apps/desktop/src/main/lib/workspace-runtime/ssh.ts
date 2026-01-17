/**
 * SSH Workspace Runtime
 *
 * This is the SSH/remote implementation of WorkspaceRuntime that wraps
 * SSHTerminalManager for remote terminal sessions.
 *
 * Similar to LocalWorkspaceRuntime but connects to remote servers via SSH.
 */

import type {
	TerminalCapabilities,
	TerminalManagement,
	TerminalRuntime,
	WorkspaceRuntime,
	WorkspaceRuntimeId,
} from "./types";
import type { SSHConnectionConfig } from "../ssh/types";
import { SSHTerminalManager } from "../ssh/ssh-terminal-manager";

// =============================================================================
// SSH Terminal Runtime Adapter
// =============================================================================

/**
 * Adapts SSHTerminalManager to the TerminalRuntime interface.
 *
 * This adapter wraps the SSH manager with the common interface,
 * allowing it to be used interchangeably with local terminals.
 */
class SSHTerminalRuntime implements TerminalRuntime {
	private readonly backend: SSHTerminalManager;

	readonly management: TerminalManagement | null = null; // SSH doesn't support daemon management
	readonly capabilities: TerminalCapabilities;

	constructor(backend: SSHTerminalManager) {
		this.backend = backend;

		// SSH sessions don't persist across app restarts (no daemon)
		this.capabilities = {
			persistent: false,
			coldRestore: false,
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
// SSH Workspace Runtime
// =============================================================================

/**
 * SSH workspace runtime implementation.
 *
 * This provides the WorkspaceRuntime interface for SSH/remote workspaces,
 * wrapping an SSHTerminalManager.
 */
export class SSHWorkspaceRuntime implements WorkspaceRuntime {
	readonly id: WorkspaceRuntimeId;
	readonly terminal: TerminalRuntime;
	readonly capabilities: WorkspaceRuntime["capabilities"];

	private readonly sshManager: SSHTerminalManager;

	constructor(config: SSHConnectionConfig) {
		this.id = `ssh:${config.id}`;

		// Create SSH terminal manager
		this.sshManager = new SSHTerminalManager(config);

		// Create terminal runtime adapter
		this.terminal = new SSHTerminalRuntime(this.sshManager);

		// Aggregate capabilities
		this.capabilities = {
			terminal: this.terminal.capabilities,
		};
	}

	/**
	 * Connect to the remote SSH server
	 */
	async connect(): Promise<void> {
		await this.sshManager.connect();
	}

	/**
	 * Disconnect from the remote SSH server
	 */
	disconnect(): void {
		this.sshManager.disconnect();
	}

	/**
	 * Check if connected
	 */
	isConnected(): boolean {
		return this.sshManager.isConnected();
	}

	/**
	 * Get the SSH configuration
	 */
	getConfig(): SSHConnectionConfig {
		return this.sshManager.getConfig();
	}
}
