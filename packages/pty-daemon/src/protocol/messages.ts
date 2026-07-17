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

/**
 * Advertised only by daemons whose live-session handoff drains accepted input,
 * establishes an exact output cut, and transfers delayed close ownership.
 */
export const LOSSLESS_LIVE_HANDOFF_CAPABILITY =
	"lossless-live-handoff-v1" as const;

/**
 * Advertised only by daemons that correlate every sequenced input frame with
 * either an `input-ack` or an error carrying the same sequence.
 */
export const CORRELATED_INPUT_ACK_CAPABILITY =
	"correlated-input-ack-v1" as const;

/**
 * Advertised only by daemons that compare a close request's expected PID with
 * the currently registered PTY before delivering the signal.
 */
export const CONDITIONAL_CLOSE_PID_CAPABILITY =
	"conditional-close-pid-v1" as const;

export interface HelloMessage {
	type: "hello";
	protocols: number[];
	clientVersion?: string;
}

export interface HelloAckMessage {
	type: "hello-ack";
	protocol: number;
	daemonVersion: string;
	/** Optional for wire compatibility with pre-capability daemons. */
	capabilities?: string[];
	/**
	 * Process id of the daemon process that accepted the connection. Supervisors
	 * use this to recover adoption state from a live socket when the manifest is
	 * missing or stale.
	 */
	daemonPid?: number;
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
	/** Optional so legacy clients keep their original wire shape. */
	sequence?: number;
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
	/** Kill only when the session id still belongs to this exact PTY process. */
	expectedPid?: number;
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

/**
 * Release adopted readers that were intentionally left staged after handoff.
 * The host sends this only after all known live subscriptions were rebound on
 * the same ordered socket, so those sessions activate through subscribe first.
 */
export interface ActivateAdoptedMessage {
	type: "activate-adopted";
}

// ---------- Daemon -> Client ----------

export interface OpenOkMessage {
	type: "open-ok";
	id: string;
	pid: number;
}

/** Confirms that one exact input payload was accepted by the session PTY. */
export interface InputAckMessage {
	type: "input-ack";
	id: string;
	sequence: number;
}

/** Bytes ride in the frame's binary tail; this message just names the session. */
export interface OutputMessage {
	type: "output";
	id: string;
}

/** Ordered boundary emitted after subscribe's optional replay frame. */
export interface SubscribedMessage {
	type: "subscribed";
	id: string;
	replayBytes: number;
	/**
	 * Absolute byte cursor of the first replay byte and the byte immediately
	 * after the replay. Together these let a reconnecting host distinguish the
	 * predecessor cut from bytes produced while an earlier successor socket was
	 * disconnected, even when the bounded ring has evicted old chunks.
	 */
	replayStartBytes?: number;
	replayEndBytes?: number;
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
	/** Present when this error rejects one exact sequenced input mutation. */
	inputSequence?: number;
	/** Proof that the correlated payload was rejected before PTY enqueue. */
	inputOutcome?: "not-enqueued";
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
	result:
		| { ok: true; successorPid: number }
		| {
				ok: false;
				reason: string;
				ownership: "predecessor" | "unresolved";
		  };
}

export interface AdoptedActivatedMessage {
	type: "adopted-activated";
	count: number;
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
	| PrepareUpgradeMessage
	| ActivateAdoptedMessage;

export type ServerMessage =
	| HelloAckMessage
	| OpenOkMessage
	| InputAckMessage
	| OutputMessage
	| SubscribedMessage
	| ExitMessage
	| ClosedMessage
	| ListReplyMessage
	| ErrorMessage
	| UpgradePreparedMessage
	| AdoptedActivatedMessage;
