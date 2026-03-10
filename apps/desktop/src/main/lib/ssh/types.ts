import type { Client, ClientChannel } from "ssh2";

export type SshConnectionState =
	| "disconnected"
	| "connecting"
	| "connected"
	| "reconnecting"
	| "error";

export interface SshHostConfig {
	id: string;
	label: string;
	hostname: string;
	port: number;
	username: string;
	authMethod: "password" | "privateKey" | "agent";
	privateKeyPath?: string;
	defaultDirectory?: string;
}

export interface SshConnectionInfo {
	hostId: string;
	state: SshConnectionState;
	client: Client | null;
	error?: string;
	reconnectAttempts: number;
}

export interface SshSessionInfo {
	paneId: string;
	hostId: string;
	channel: ClientChannel;
	cwd: string;
	createdAt: number;
}

export interface SshConnectionEvents {
	"state-change": (
		hostId: string,
		state: SshConnectionState,
		error?: string,
	) => void;
	"session-data": (paneId: string, data: Buffer) => void;
	"session-exit": (
		paneId: string,
		code: number | null,
		signal?: string,
	) => void;
}
