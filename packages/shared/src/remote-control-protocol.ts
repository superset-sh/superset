export const REMOTE_CONTROL_TAIL_BYTES = 262144;
export const REMOTE_CONTROL_DEFAULT_TTL_SEC = 14400;
export const REMOTE_CONTROL_MAX_TTL_SEC = 86400;
export const REMOTE_CONTROL_MIN_TTL_SEC = 60;
export const REMOTE_CONTROL_INPUT_RATE_PER_SEC = 200;
export const REMOTE_CONTROL_RESIZE_RATE_PER_SEC = 10;
export const REMOTE_CONTROL_MAX_VIEWERS = 4;
export const REMOTE_CONTROL_TOKEN_PARAM = "remoteControlToken";
export const REMOTE_CONTROL_PROTOCOL_VERSION = 1 as const;

export const REMOTE_CONTROL_MODES = ["command", "full"] as const;
export type RemoteControlMode = (typeof REMOTE_CONTROL_MODES)[number];

export const REMOTE_CONTROL_STATUSES = [
	"active",
	"revoked",
	"expired",
] as const;
export type RemoteControlStatus = (typeof REMOTE_CONTROL_STATUSES)[number];

export interface RemoteControlCapabilities {
	read: true;
	input: boolean;
	resize: boolean;
	runCommand: boolean;
	dispose: false;
}

export function capabilitiesForMode(
	mode: RemoteControlMode,
): RemoteControlCapabilities {
	if (mode === "full") {
		return {
			read: true,
			input: true,
			resize: true,
			runCommand: true,
			dispose: false,
		};
	}
	return {
		read: true,
		input: false,
		resize: false,
		runCommand: true,
		dispose: false,
	};
}

export type RemoteControlErrorCode =
	| "invalid-token"
	| "session-not-found"
	| "session-expired"
	| "capability-denied"
	| "rate-limited"
	| "max-viewers"
	| "internal";

export type RemoteControlRevokeReason =
	| "manual"
	| "expired"
	| "host-shutdown"
	| "terminal";

export interface RemoteControlInputMessage {
	type: "input";
	data: string;
}
export interface RemoteControlResizeMessage {
	type: "resize";
	cols: number;
	rows: number;
}
export interface RemoteControlRunCommandMessage {
	type: "runCommand";
	command: string;
	commandId?: string;
}
export interface RemoteControlPingMessage {
	type: "ping";
	nonce?: string;
}
export interface RemoteControlStopMessage {
	type: "stop";
}
export type RemoteControlClientMessage =
	| RemoteControlInputMessage
	| RemoteControlResizeMessage
	| RemoteControlRunCommandMessage
	| RemoteControlPingMessage
	| RemoteControlStopMessage;

export interface RemoteControlHelloMessage {
	type: "hello";
	sessionId: string;
	terminalId: string;
	mode: RemoteControlMode;
	capabilities: RemoteControlCapabilities;
	cols: number;
	rows: number;
	title: string | null;
}
export interface RemoteControlSnapshotMessage {
	type: "snapshot";
	data: string;
	outputSequence: number;
}
export interface RemoteControlDataMessage {
	type: "data";
	data: string;
	outputSequence: number;
}
export interface RemoteControlTitleMessage {
	type: "title";
	title: string | null;
}
export interface RemoteControlExitMessage {
	type: "exit";
	exitCode: number;
	signal: number;
}
export interface RemoteControlRevokedMessage {
	type: "revoked";
	reason: RemoteControlRevokeReason;
}
export interface RemoteControlPongMessage {
	type: "pong";
	nonce?: string;
}
export interface RemoteControlErrorMessage {
	type: "error";
	code: RemoteControlErrorCode;
	message: string;
}
export interface RemoteControlPresenceMessage {
	type: "presence";
	viewerCount: number;
}
export type RemoteControlServerMessage =
	| RemoteControlHelloMessage
	| RemoteControlSnapshotMessage
	| RemoteControlDataMessage
	| RemoteControlTitleMessage
	| RemoteControlExitMessage
	| RemoteControlRevokedMessage
	| RemoteControlPongMessage
	| RemoteControlErrorMessage
	| RemoteControlPresenceMessage;

export interface RemoteControlTokenClaims {
	v: typeof REMOTE_CONTROL_PROTOCOL_VERSION;
	sid: string;
	tid: string;
	wid: string;
	mode: RemoteControlMode;
	uid: string;
	iat: number;
	exp: number;
}
