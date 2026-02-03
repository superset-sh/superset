/**
 * Control Plane Types
 *
 * Shared types for the Superset Cloud control plane.
 */

/**
 * Cloudflare Worker environment bindings.
 */
export interface Env {
	// Durable Objects
	SESSION_DO: DurableObjectNamespace;

	// KV Namespaces
	SESSION_TOKENS: KVNamespace;

	// Secrets
	MODAL_API_SECRET: string;
	MODAL_WORKSPACE: string;
	CONTROL_PLANE_URL: string;
	ANTHROPIC_API_KEY?: string;
	GITHUB_APP_ID?: string;
	GITHUB_APP_PRIVATE_KEY?: string;
	GITHUB_APP_INSTALLATION_ID?: string;

	// Environment
	ENVIRONMENT: string;
}

/**
 * Session status values.
 */
export type SessionStatus =
	| "created"
	| "active"
	| "paused"
	| "completed"
	| "archived";

/**
 * Sandbox status values.
 */
export type SandboxStatus =
	| "pending"
	| "warming"
	| "syncing"
	| "ready"
	| "running"
	| "stopped"
	| "failed";

/**
 * Session configuration passed to sandbox.
 */
export interface SessionConfig {
	sessionId: string;
	repoOwner: string;
	repoName: string;
	branch: string;
	baseBranch: string;
	provider: string;
	model: string;
	gitUserName?: string;
	gitUserEmail?: string;
}

/**
 * Client connection info for WebSocket management.
 */
export interface ClientInfo {
	participantId: string;
	userId: string;
	userName: string;
	source: "web" | "desktop" | "slack";
	authenticatedAt: number;
}

/**
 * Sandbox connection info for WebSocket management.
 */
export interface SandboxInfo {
	sandboxId: string;
	authenticatedAt: number;
}

/**
 * Messages sent from sandbox to control plane.
 */
export type SandboxMessage =
	| { type: "sandbox_connect"; sandboxId: string; token: string }
	| { type: "event"; event: SandboxEvent }
	| { type: "execution_started"; messageId: string }
	| { type: "execution_complete"; messageId: string; success: boolean }
	| { type: "pong" };

/**
 * Author info for prompt attribution and git identity.
 */
export interface PromptAuthor {
	userId: string;
	githubName: string | null;
	githubEmail: string | null;
}

/**
 * Messages sent from control plane to sandbox.
 */
export type ControlPlaneToSandboxMessage =
	| { type: "sandbox_connected"; sessionId: string }
	| {
			type: "prompt";
			messageId: string;
			content: string;
			model?: string;
			author?: PromptAuthor;
			attachments?: Array<{
				type: string;
				name: string;
				url?: string;
				content?: string;
			}>;
	  }
	| { type: "stop" }
	| {
			type: "push";
			branchName: string;
			repoOwner?: string;
			repoName?: string;
			githubToken?: string;
	  }
	| { type: "snapshot" }
	| { type: "shutdown" }
	| { type: "ping" }
	| { type: "error"; message: string };

/**
 * Messages sent from clients to the server.
 */
export type ClientMessage =
	| { type: "subscribe"; token: string }
	| {
			type: "prompt";
			content: string;
			authorId: string;
			model?: string;
			attachments?: Array<{
				type: string;
				name: string;
				url?: string;
				content?: string;
			}>;
	  }
	| { type: "stop" }
	| {
			type: "push";
			branchName: string;
			repoOwner?: string;
			repoName?: string;
	  }
	| { type: "snapshot" }
	| { type: "shutdown" }
	| { type: "ping" }
	| { type: "typing" };

/**
 * Historical message data sent to clients on subscribe.
 */
export interface HistoricalMessage {
	id: string;
	content: string;
	role: string;
	status: string;
	participantId: string | null;
	createdAt: number;
	completedAt: number | null;
}

/**
 * Messages sent from server to clients.
 */
export type ServerMessage =
	| { type: "subscribed"; sessionId: string; state: SessionState }
	| { type: "history"; messages: HistoricalMessage[] }
	| { type: "event"; event: SandboxEvent }
	| { type: "state_update"; state: Partial<SessionState> }
	| { type: "artifacts_update"; artifacts: Artifact[] }
	| { type: "presence_sync"; participants: ParticipantPresence[] }
	| {
			type: "presence_update";
			action: "join" | "leave" | "idle" | "active";
			participant: ParticipantPresence;
	  }
	| { type: "error"; message: string }
	| { type: "pong" }
	| {
			type: "prompt_ack";
			messageId: string;
			status: "forwarded" | "queued";
			message?: string;
	  }
	| { type: "stop_ack"; status: "sent" | "failed"; message?: string }
	| { type: "push_ack"; status: "sent" | "failed"; message?: string }
	| { type: "snapshot_ack"; status: "sent" | "failed"; message?: string }
	| { type: "shutdown_ack"; status: "sent" | "failed"; message?: string };

/**
 * Events from the sandbox.
 */
export interface SandboxEvent {
	id: string;
	type:
		| "tool_call"
		| "tool_result"
		| "token"
		| "error"
		| "git_sync"
		| "execution_complete"
		| "heartbeat"
		| "push_complete"
		| "push_error"
		| "ready"
		| "snapshot_ready"
		| "step_start"
		| "step_finish";
	timestamp: number;
	data: unknown;
	messageId?: string;
}

/**
 * Session state returned to clients.
 */
export interface SessionState {
	sessionId: string;
	status: SessionStatus;
	sandboxStatus: SandboxStatus;
	repoOwner: string;
	repoName: string;
	branch: string;
	baseBranch: string;
	model: string;
	participants: ParticipantPresence[];
	artifacts: Artifact[];
	filesChanged: FileChange[];
	messageCount: number;
	eventCount: number;
	createdAt: number;
	updatedAt: number;
	snapshotId?: string;
	modalObjectId?: string;
}

/**
 * File change info.
 */
export interface FileChange {
	path: string;
	type: "added" | "modified" | "deleted";
	lastModified: number;
}

/**
 * Participant presence info.
 */
export interface ParticipantPresence {
	id: string;
	userId: string;
	userName: string;
	avatarUrl?: string;
	source: "web" | "desktop" | "slack";
	isOnline: boolean;
	lastSeenAt: number;
}

/**
 * Database row types for SQLite storage.
 */
export interface SessionRow {
	id: string;
	organization_id: string;
	user_id: string;
	repo_owner: string;
	repo_name: string;
	branch: string;
	base_branch: string;
	status: string;
	sandbox_status: string;
	model: string;
	sandbox_id: string | null;
	snapshot_id: string | null;
	pr_url: string | null;
	pr_number: number | null;
	linear_issue_id: string | null;
	linear_issue_key: string | null;
	files_changed: string;
	created_at: number;
	updated_at: number;
	archived_at: number | null;
}

export interface ParticipantRow {
	id: string;
	session_id: string;
	user_id: string;
	github_login: string | null;
	github_name: string | null;
	source: string;
	joined_at: number;
	last_seen_at: number;
}

export interface MessageRow {
	id: string;
	session_id: string;
	participant_id: string | null;
	content: string;
	role: string;
	status: string;
	created_at: number;
	completed_at: number | null;
}

export interface EventRow {
	id: string;
	session_id: string;
	message_id: string | null;
	type: string;
	data: string;
	created_at: number;
}

export interface SandboxRow {
	id: string;
	session_id: string;
	modal_object_id: string | null;
	status: string;
	snapshot_id: string | null;
	created_at: number;
	terminated_at: number | null;
}

/**
 * Artifact types for session outputs.
 */
export type ArtifactType = "pr" | "preview" | "screenshot" | "file";

/**
 * Artifact status values.
 */
export type ArtifactStatus = "active" | "deleted";

/**
 * Artifact data returned to clients.
 */
export interface Artifact {
	id: string;
	type: ArtifactType;
	url: string | null;
	title: string | null;
	description: string | null;
	metadata: Record<string, unknown> | null;
	status: ArtifactStatus;
	createdAt: number;
	updatedAt: number;
}

export interface ArtifactRow {
	id: string;
	session_id: string;
	type: string;
	url: string | null;
	title: string | null;
	description: string | null;
	metadata: string | null;
	status: string;
	created_at: number;
	updated_at: number;
}
