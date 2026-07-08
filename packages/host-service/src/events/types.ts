import type { DetectedPort } from "@superset/port-scanner";
import type { AgentIdentity } from "@superset/shared/agent-identity";
import type { FsWatchEvent } from "@superset/workspace-fs/host";
import type { AgentLifecycleEventType } from "./map-event-type.ts";

// ── Server → Client ────────────────────────────────────────────────

export interface FsEventsMessage {
	type: "fs:events";
	workspaceId: string;
	events: FsWatchEvent[];
}

export interface GitChangedMessage {
	type: "git:changed";
	workspaceId: string;
	/**
	 * Worktree-relative paths that changed when the batch was worktree-only.
	 * Absent means a broad git state change (`.git/` activity — commit, index,
	 * refs, or mixed) — consumers should invalidate everything for the
	 * workspace.
	 */
	paths?: string[];
}

export interface AgentLifecycleMessage {
	type: "agent:lifecycle";
	workspaceId: string;
	eventType: AgentLifecycleEventType;
	terminalId: string;
	// Absent when the hook ran without `SUPERSET_AGENT_ID` set (legacy shells
	// or third-party hook configs that bypass our wrappers).
	agent?: AgentIdentity;
	occurredAt: number;
}

export interface TerminalLifecycleMessage {
	type: "terminal:lifecycle";
	workspaceId: string;
	terminalId: string;
	eventType: "exit";
	exitCode: number;
	signal: number;
	occurredAt: number;
}

export interface PortChangedMessage {
	type: "port:changed";
	workspaceId: string;
	eventType: "add" | "remove";
	port: DetectedPort;
	label: string | null;
	occurredAt: number;
}

/**
 * Snapshot of a host-owned workspace row as carried on the event bus.
 * Structural (not the drizzle inferred type) so workspace-client consumers
 * don't couple to the host's schema module.
 */
export interface WorkspaceSnapshot {
	id: string;
	projectId: string;
	name: string;
	branch: string;
	type: "main" | "worktree";
	worktreePath: string;
	taskId: string | null;
	createdByUserId: string | null;
	createdAt: number;
	updatedAt: number;
}

export interface WorkspaceChangedMessage {
	type: "workspace:changed";
	workspaceId: string;
	eventType: "created" | "updated" | "deleted";
	/** Null for `deleted` — the row is already gone. */
	workspace: WorkspaceSnapshot | null;
	occurredAt: number;
}

export interface EventBusErrorMessage {
	type: "error";
	message: string;
}

export type ServerMessage =
	| FsEventsMessage
	| GitChangedMessage
	| AgentLifecycleMessage
	| TerminalLifecycleMessage
	| PortChangedMessage
	| WorkspaceChangedMessage
	| EventBusErrorMessage;

// ── Client → Server ────────────────────────────────────────────────

export interface FsWatchCommand {
	type: "fs:watch";
	workspaceId: string;
}

export interface FsUnwatchCommand {
	type: "fs:unwatch";
	workspaceId: string;
}

export type ClientMessage = FsWatchCommand | FsUnwatchCommand;
