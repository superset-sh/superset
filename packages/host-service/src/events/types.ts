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
	/** Null for project-less "session" workspaces. */
	projectId: string | null;
	name: string;
	branch: string;
	type: "main" | "worktree" | "session";
	worktreePath: string;
	taskId: string | null;
	createdByUserId: string | null;
	createdAt: number;
	updatedAt: number;
	/** Normalized, sorted tag set; sidebar folders derive from it. */
	tags: string[];
}

export interface WorkspaceChangedMessage {
	type: "workspace:changed";
	workspaceId: string;
	eventType: "created" | "updated" | "deleted";
	/** Null for `deleted` — the row is already gone. */
	workspace: WorkspaceSnapshot | null;
	occurredAt: number;
}

/** One tag folder's host-side presentation (see workspace_tag_settings). */
export interface TagSettingSnapshot {
	tag: string;
	displayName: string | null;
	color: string | null;
	tabOrder: number | null;
}

/**
 * Snapshot of a host-owned project row as carried on the event bus.
 * Structural (not the drizzle inferred type) so workspace-client consumers
 * don't couple to the host's schema module.
 */
export interface ProjectSnapshot {
	id: string;
	name: string;
	repoPath: string;
	repoOwner: string | null;
	repoName: string | null;
	repoUrl: string | null;
	worktreeBaseDir: string | null;
	/** Custom icon data-URI, or null to fall back to the GitHub avatar. */
	icon: string | null;
	/** Accent color as a `#rrggbb` hex, or null for the default. */
	color: string | null;
	createdAt: number;
	updatedAt: number;
	/**
	 * Tag-folder presentation rows. Optional: absent on snapshots built where
	 * the emitter had no settings at hand (and from older hosts) — consumers
	 * keep their last known set rather than clearing.
	 */
	tagSettings?: TagSettingSnapshot[];
}

export interface ProjectChangedMessage {
	type: "project:changed";
	projectId: string;
	eventType: "created" | "updated" | "deleted";
	/** Null for `deleted` — the row is already gone. */
	project: ProjectSnapshot | null;
	occurredAt: number;
}

export interface WorkspaceCreateTerminalLaunch {
	terminalId: string;
	label?: string;
}

export type WorkspaceCreateAgentLaunch =
	| { ok: true; kind: "terminal"; sessionId: string; label: string }
	| { ok: false; error: string };

/**
 * Terminal event for an enqueued `workspaces.createEnqueued` call. The HTTP
 * response returns immediately; this carries what the synchronous
 * `workspaces.create` response used to: the canonical row id (which can
 * differ from the enqueue id when the create resolved to an existing
 * workspace) and the launched terminals/agents for the pane-layout seed.
 */
export interface WorkspaceCreateSettledMessage {
	type: "workspace:create-settled";
	/** The client-minted id from the enqueue call — the correlation key. */
	workspaceId: string;
	ok: boolean;
	canonicalWorkspaceId: string | null;
	projectId: string | null;
	terminals: WorkspaceCreateTerminalLaunch[];
	agents: WorkspaceCreateAgentLaunch[];
	alreadyExists: boolean;
	error?: string;
	occurredAt: number;
}

export interface EventBusErrorMessage {
	type: "error";
	message: string;
}

export interface PageWatchChangedMessage {
	type: "page-watch:changed";
	workspaceId: string;
	occurredAt: number;
}

export type ServerMessage =
	| FsEventsMessage
	| GitChangedMessage
	| AgentLifecycleMessage
	| TerminalLifecycleMessage
	| PortChangedMessage
	| WorkspaceChangedMessage
	| WorkspaceCreateSettledMessage
	| ProjectChangedMessage
	| PageWatchChangedMessage
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

/**
 * Targeted watch on one file the recursive workspace watcher can't see
 * (inside a pruned subtree — gitignored build dir, node_modules, nested
 * repo). Sent by the renderer for every open document; the server installs a
 * per-file watcher only when the recursive watch doesn't already cover the
 * path. Events come back as regular `fs:events` messages.
 */
export interface FsWatchFileCommand {
	type: "fs:watch-file";
	workspaceId: string;
	absolutePath: string;
}

export interface FsUnwatchFileCommand {
	type: "fs:unwatch-file";
	workspaceId: string;
	absolutePath: string;
}

export type ClientMessage =
	| FsWatchCommand
	| FsUnwatchCommand
	| FsWatchFileCommand
	| FsUnwatchFileCommand;
