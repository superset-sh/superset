import type { SerializeAddon } from "@xterm/addon-serialize";
import type { Terminal as HeadlessTerminal } from "@xterm/headless";
import type { DataBatcher } from "../data-batcher";

export interface CloudTerminalSession {
	paneId: string;
	cloudWorkspaceId: string;
	vmId: string;
	terminalId: string;
	cols: number;
	rows: number;
	lastActive: number;
	headless: HeadlessTerminal;
	serializer: SerializeAddon;
	isAlive: boolean;
	wasRecovered: boolean;
	dataBatcher: DataBatcher;
	startTime: number;
	/** Saved viewport scroll position for restoration on reattach */
	viewportY?: number;
	/** WebSocket connection for Freestyle terminal */
	ws?: WebSocket;
}

export interface CloudTerminalDataEvent {
	type: "data";
	data: string;
}

export interface CloudTerminalExitEvent {
	type: "exit";
	exitCode: number;
	signal?: number;
}

export type CloudTerminalEvent = CloudTerminalDataEvent | CloudTerminalExitEvent;

export interface CloudSessionResult {
	isNew: boolean;
	scrollback: string;
	wasRecovered: boolean;
	viewportY?: number;
}

export interface CreateCloudSessionParams {
	paneId: string;
	tabId: string;
	cloudWorkspaceId: string;
	vmId: string;
	cols?: number;
	rows?: number;
}

export interface CloudSSHCredentials {
	host: string;
	port: number;
	username: string;
	privateKey?: string;
	token?: string;
}
