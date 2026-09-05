import type { DetectedPort } from "@superset/port-scanner";
import type { AgentIdentity } from "@superset/shared/agent-identity";
import type { WorkspaceTagAssignment } from "@superset/shared/workspace-tags";
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

/**
 * Invalidation-only signal for host-owned agent bindings changed outside a
 * lifecycle hook (for example, the sidebar's Clear Status action). This is
 * intentionally separate from `agent:lifecycle`: consumers should refetch
 * binding state without playing completion sounds or showing notifications.
 */
export interface AgentBindingsChangedMessage {
	type: "agent:bindings-changed";
	workspaceId: string;
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
	/**
	 * Epoch ms of the newest agent lifecycle event, or null for rows that
	 * predate the column. Unlike `updatedAt` it never moves on metadata
	 * writes (rename, tags, PR link).
	 */
	lastActivityAt: number | null;
	/**
	 * Every tag on the workspace, normalized and sorted, whoever applied it.
	 * Consumers that know who they are read `tagAssignments` instead.
	 */
	tags: string[];
	/**
	 * Each tag with the user who applied it. Tags are personal (see
	 * `isWorkspaceTagVisibleTo`): a client keeps the ones it can see and
	 * derives its sidebar folders from those. Absent from hosts that predate
	 * the field.
	 */
	tagAssignments?: WorkspaceTagAssignment[];
}

export interface WorkspaceChangedMessage {
	type: "workspace:changed";
	workspaceId: string;
	eventType: "created" | "updated" | "deleted";
	/** Null for `deleted` — the row is already gone. */
	workspace: WorkspaceSnapshot | null;
	occurredAt: number;
}

/** One tag folder's host-side presentation (see tag_folder_settings). */
export interface TagSettingSnapshot {
	tag: string;
	displayName: string | null;
	color: string | null;
	tabOrder: number | null;
}

/**
 * A tag folder's presentation plus the scope it lives under — a project id,
 * or `SESSIONS_TAG_SCOPE` for the project-less Sessions lane. Folders travel
 * on their own channel rather than riding project snapshots, because the
 * Sessions lane has no project to ride on.
 */
export interface TagFolderSettingSnapshot extends TagSettingSnapshot {
	scope: string;
}

export interface TagFoldersChangedMessage {
	type: "tag-folders:changed";
	/** The scope whose folders changed. */
	scope: string;
	/** The scope's full set after the change — empty when all were removed. */
	settings: TagFolderSettingSnapshot[];
	occurredAt: number;
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
	 * @deprecated Compatibility for desktops that predate the tagFolders
	 * router. New consumers read tag-folder presentation from that router.
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
	/** Set on command rejections a client can act on. */
	code?: "git-watch-cap";
	/** The workspace whose command was rejected. */
	workspaceId?: string;
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
	| AgentBindingsChangedMessage
	| TerminalLifecycleMessage
	| PortChangedMessage
	| WorkspaceChangedMessage
	| WorkspaceCreateSettledMessage
	| ProjectChangedMessage
	| TagFoldersChangedMessage
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
 * Register interest in a workspace's `git:changed` events, driving
 * `GitWatcher`'s refcounted registration (see #6729) — a workspace with no
 * `git:watch` interest from any client, and no internal host-service
 * subscriber, is never watched.
 */
export interface GitWatchCommand {
	type: "git:watch";
	workspaceId: string;
}

export interface GitUnwatchCommand {
	type: "git:unwatch";
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
	| FsUnwatchFileCommand
	| GitWatchCommand
	| GitUnwatchCommand;
