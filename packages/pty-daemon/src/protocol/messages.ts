// Message schemas for the pty-daemon Unix socket protocol.
//
// Wire format (v2): see ./framing.ts. Each frame carries a JSON header
// and an optional binary payload tail. PTY input/output bytes ride in
// the payload tail — they are NOT base64-encoded inside the JSON.
//
// See ../README.md and ../../../../apps/desktop/plans/20260429-pty-daemon-implementation.md

export interface SessionMeta {
	shell: string;
	argv: string[];
	cwd?: string;
	env?: Record<string, string>;
	cols: number;
	rows: number;
}

export interface SessionInfo {
	id: string;
	pid: number;
	cols: number;
	rows: number;
	alive: boolean;
}

// ---------- Handshake ----------

export interface HelloMessage {
	type: "hello";
	protocols: number[];
	clientVersion?: string;
}

export interface HelloAckMessage {
	type: "hello-ack";
	protocol: number;
	daemonVersion: string;
}

// ---------- Client -> Daemon ----------

export interface OpenMessage {
	type: "open";
	id: string;
	meta: SessionMeta;
}

/** Bytes ride in the frame's binary tail; this message just names the session. */
export interface InputMessage {
	type: "input";
	id: string;
}

export interface ResizeMessage {
	type: "resize";
	id: string;
	cols: number;
	rows: number;
}

export interface CloseMessage {
	type: "close";
	id: string;
	signal?: "SIGINT" | "SIGTERM" | "SIGKILL" | "SIGHUP";
}

export interface ListMessage {
	type: "list";
}

export interface SubscribeMessage {
	type: "subscribe";
	id: string;
	/** if true, replay buffered output before live streaming */
	replay: boolean;
}

export interface UnsubscribeMessage {
	type: "unsubscribe";
	id: string;
}

/**
 * Phase 2: client tells the daemon to spawn a successor process and hand
 * the PTY master fds over via stdio inheritance. Daemon replies with
 * `upgrade-prepared` once the successor has acknowledged adoption (or
 * once handoff has been determined to have failed).
 *
 * Only valid for trusted clients (the supervisor). The 0600 socket file
 * permission is the auth boundary; same as everything else on the wire.
 */
export interface PrepareUpgradeMessage {
	type: "prepare-upgrade";
}

// ---------- Daemon -> Client ----------

export interface OpenOkMessage {
	type: "open-ok";
	id: string;
	pid: number;
}

/** Bytes ride in the frame's binary tail; this message just names the session. */
export interface OutputMessage {
	type: "output";
	id: string;
}

export interface ExitMessage {
	type: "exit";
	id: string;
	code: number | null;
	signal: number | null;
}

export interface ClosedMessage {
	type: "closed";
	id: string;
}

export interface ListReplyMessage {
	type: "list-reply";
	sessions: SessionInfo[];
}

export interface ErrorMessage {
	type: "error";
	id?: string;
	message: string;
	code?: string;
}

/**
 * Reply to `prepare-upgrade`. Carries either the successor's pid (so the
 * supervisor's manifest watcher knows what to look for) or the reason
 * handoff failed.
 */
export interface UpgradePreparedMessage {
	type: "upgrade-prepared";
	result: { ok: true; successorPid: number } | { ok: false; reason: string };
}

// ---------- Unions ----------

export type ClientMessage =
	| HelloMessage
	| OpenMessage
	| InputMessage
	| ResizeMessage
	| CloseMessage
	| ListMessage
	| SubscribeMessage
	| UnsubscribeMessage
	| PrepareUpgradeMessage;

export type ServerMessage =
	| HelloAckMessage
	| OpenOkMessage
	| OutputMessage
	| ExitMessage
	| ClosedMessage
	| ListReplyMessage
	| ErrorMessage
	| UpgradePreparedMessage;
