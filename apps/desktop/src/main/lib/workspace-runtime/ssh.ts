import type { SshWorkspaceConfig } from "@superset/local-db";
import { SshConnectionManager } from "../ssh/connection-manager";
import { SshTerminalManager } from "../ssh/ssh-terminal-manager";
import { ZmxSessionManager } from "../ssh/zmx-manager";
import type {
	TerminalRuntime,
	WorkspaceRuntime,
	WorkspaceRuntimeId,
} from "./types";

export class SshWorkspaceRuntime implements WorkspaceRuntime {
	readonly id: WorkspaceRuntimeId;
	readonly terminal: TerminalRuntime;
	readonly capabilities: WorkspaceRuntime["capabilities"];

	private readonly connectionManager: SshConnectionManager;
	private readonly zmxManager: ZmxSessionManager;

	constructor(workspaceId: string, config: SshWorkspaceConfig) {
		this.id = workspaceId;

		this.connectionManager = new SshConnectionManager(config, workspaceId);
		this.zmxManager = new ZmxSessionManager(this.connectionManager);

		const terminalManager = new SshTerminalManager(
			this.connectionManager,
			this.zmxManager,
		);

		this.terminal = terminalManager as TerminalRuntime;

		this.capabilities = {
			terminal: terminalManager.capabilities,
		};
	}

	async cleanup(): Promise<void> {
		await this.terminal.cleanup();
		await this.connectionManager.stop();
	}
}
