/**
 * Workspace Runtime Abstraction Types
 *
 * This module defines the contracts for workspace-scoped runtime providers.
 * The WorkspaceRuntime boundary encapsulates backend-specific behavior
 * (local daemon today, or cloud/SSH in the future).
 *
 * Key invariants:
 * 1. Stream subscriptions MUST NOT complete on session exit (exit is a state transition)
 * 2. Capability presence (e.g., management !== null) indicates feature availability,
 *    not "health right now"; mid-session failures should propagate as errors
 * 3. Operations use sync signatures where latency-critical (write, resize, signal, detach);
 *    async signatures for lifecycle ops (createOrAttach, kill, cleanup)
 *
 * Reference: apps/desktop/plans/20260109-2313-terminal-runtime-abstraction-rewrite.md
 */

import type { EventEmitter } from "node:events";
import type { CreateSessionParams, SessionResult } from "../terminal/types";
import type { ListSessionsResponse } from "../terminal-host/types";

// =============================================================================
// Identity Types
// =============================================================================

/**
 * Workspace runtime identifier - unique per runtime instance.
 */
export type WorkspaceRuntimeId = string;

// =============================================================================
// Terminal Capabilities
// =============================================================================

/**
 * Terminal backend capabilities.
 * These flags indicate what features are available for this backend.
 */
export interface TerminalCapabilities {
	/** Sessions can survive app restarts (daemon mode) */
	persistent: boolean;
	/** Cold restore from disk is supported after unclean shutdown */
	coldRestore: boolean;
}

// =============================================================================
// Terminal Management (Session Admin)
// =============================================================================

/**
 * Terminal management capabilities for listing and killing sessions.
 * These are available for daemon-backed runtimes.
 */
export interface TerminalManagement {
	/** List all sessions in the daemon */
	listSessions(): Promise<ListSessionsResponse>;
	/** Kill all sessions in the daemon */
	killAllSessions(): Promise<void>;
	/** Reset history persistence (reinitialize all history writers) */
	resetHistoryPersistence(): Promise<void>;
}

// =============================================================================
// Terminal Session Operations
// =============================================================================

/**
 * Core terminal session operations.
 * These are the backend-agnostic operations that any terminal backend must support.
 */
export interface TerminalSessionOperations {
	/**
	 * Create a new session or attach to an existing one.
	 * Deduplicates concurrent calls for the same paneId.
	 */
	createOrAttach(params: CreateSessionParams): Promise<SessionResult>;

	/** Write data to the terminal */
	write(params: { paneId: string; data: string }): void;

	/** Resize the terminal */
	resize(params: { paneId: string; cols: number; rows: number }): void;

	/** Send a signal to the terminal process */
	signal(params: { paneId: string; signal?: string }): void;

	/** Kill the terminal session */
	kill(params: { paneId: string }): Promise<void>;

	/**
	 * Detach from the terminal (keep session alive).
	 */
	detach(params: { paneId: string }): void;

	/** Clear the scrollback buffer */
	clearScrollback(params: { paneId: string }): void | Promise<void>;

	/** Acknowledge cold restore - clears sticky cold restore info. */
	ackColdRestore(paneId: string): void;

	/** Get session info */
	getSession(
		paneId: string,
	): { isAlive: boolean; cwd: string; lastActive: number } | null;
}

// =============================================================================
// Terminal Workspace Operations
// =============================================================================

/**
 * Workspace-scoped terminal operations.
 * These operate on all sessions within a workspace.
 */
export interface TerminalWorkspaceOperations {
	/** Kill all sessions for a workspace */
	killByWorkspaceId(
		workspaceId: string,
	): Promise<{ killed: number; failed: number }>;

	/** Get count of alive sessions for a workspace */
	getSessionCountByWorkspaceId(workspaceId: string): Promise<number>;

	/** Send newline to all terminals in a workspace to refresh prompts */
	refreshPromptsForWorkspace(workspaceId: string): void;
}

// =============================================================================
// Terminal Event Source
// =============================================================================

/**
 * Terminal event source interface.
 * The underlying implementation uses EventEmitter with events like:
 * - `data:${paneId}` - terminal output
 * - `exit:${paneId}` - session exited (exitCode, signal?)
 * - `disconnect:${paneId}` - daemon connection lost (daemon mode only)
 * - `error:${paneId}` - terminal error (daemon mode only)
 * - `terminalExit` - global exit event for cleanup
 *
 * CRITICAL INVARIANT: Subscriptions MUST NOT complete on exit.
 * Exit is a state transition, not stream completion.
 */
export interface TerminalEventSource extends EventEmitter {
	/** Remove all terminal-specific listeners */
	detachAllListeners(): void;
}

// =============================================================================
// Terminal Runtime
// =============================================================================

/**
 * Terminal runtime interface - the backend-agnostic terminal surface.
 *
 * This combines session operations, workspace operations, event source,
 * and optional management capabilities into a single interface.
 *
 * Implementation:
 * - Daemon: DaemonTerminalManager (persistent, management available)
 */
export interface TerminalRuntime
	extends TerminalSessionOperations,
		TerminalWorkspaceOperations,
		TerminalEventSource {
	/** Session management capabilities (daemon-backed). */
	management: TerminalManagement;

	/** Terminal capabilities for this backend */
	capabilities: TerminalCapabilities;

	/** Cleanup on app quit */
	cleanup(): Promise<void>;
}

// =============================================================================
// Workspace Runtime
// =============================================================================

/**
 * Workspace runtime interface - the workspace-scoped provider boundary.
 *
 * This is the primary abstraction for local vs daemon vs cloud backends.
 * The terminal runtime is a sub-component; future work will add
 * changes/files/agentEvents to this same boundary for cloud workspaces.
 */
export interface WorkspaceRuntime {
	/** Unique identifier for this runtime instance */
	id: WorkspaceRuntimeId;

	/** Terminal runtime (session ops + events + management) */
	terminal: TerminalRuntime;

	/** Aggregated capabilities for this runtime */
	capabilities: {
		terminal: TerminalCapabilities;
		// Future: changes, files, agentEvents capabilities
	};
}

// =============================================================================
// Workspace Runtime Registry
// =============================================================================

/**
 * Workspace runtime registry - process-scoped selection of runtime providers.
 *
 * The registry is captured once when the tRPC router is created.
 * It returns stable provider instances (cached) so event wiring is consistent.
 *
 * This design allows local + cloud workspaces to coexist later without
 * re-spreading backend-specific branching throughout the application.
 */
export interface WorkspaceRuntimeRegistry {
	/**
	 * Get the runtime for a specific workspace.
	 * Currently always returns the default local runtime,
	 * but the interface supports per-workspace selection for cloud.
	 */
	getForWorkspaceId(workspaceId: string): WorkspaceRuntime;

	/**
	 * Get the default runtime (for global/legacy endpoints).
	 * Used by settings screens and endpoints that don't have workspace context.
	 */
	getDefault(): WorkspaceRuntime;
}
