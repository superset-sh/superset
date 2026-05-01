// Message schemas for the pty-daemon Unix socket protocol.
//
// Wire format: 4-byte big-endian length prefix + UTF-8 JSON payload.
// Binary data (PTY input/output) travels base64-encoded inside the JSON.
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

export interface InputMessage {
	type: "input";
	id: string;
	/** base64-encoded bytes */
	data: string;
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

// ---------- Daemon -> Client ----------

export interface OpenOkMessage {
	type: "open-ok";
	id: string;
	pid: number;
}

export interface OutputMessage {
	type: "output";
	id: string;
	/** base64-encoded bytes */
	data: string;
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

// ---------- Unions ----------

export type ClientMessage =
	| HelloMessage
	| OpenMessage
	| InputMessage
	| ResizeMessage
	| CloseMessage
	| ListMessage
	| SubscribeMessage
	| UnsubscribeMessage;

export type ServerMessage =
	| HelloAckMessage
	| OpenOkMessage
	| OutputMessage
	| ExitMessage
	| ClosedMessage
	| ListReplyMessage
	| ErrorMessage;
