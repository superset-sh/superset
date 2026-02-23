import type { GetHeaders } from "../lib/auth/auth";
import { AgentManager, type AgentManagerConfig } from "./agent-manager";

export type ChatLifecycleEventType = "Start" | "PermissionRequest" | "Stop";

export interface ChatLifecycleEvent {
	sessionId: string;
	eventType: ChatLifecycleEventType;
}

export interface ChatServiceHostConfig {
	deviceId: string;
	apiUrl: string;
	getHeaders: GetHeaders;
	onLifecycleEvent?: (event: ChatLifecycleEvent) => void;
}

export class ChatService {
	private agentManager: AgentManager | null = null;
	private hostConfig: ChatServiceHostConfig;

	constructor(hostConfig: ChatServiceHostConfig) {
		this.hostConfig = hostConfig;
	}

	async start(options: { organizationId: string }): Promise<void> {
		const config: AgentManagerConfig = {
			deviceId: this.hostConfig.deviceId,
			organizationId: options.organizationId,
			apiUrl: this.hostConfig.apiUrl,
			getHeaders: this.hostConfig.getHeaders,
			onLifecycleEvent: this.hostConfig.onLifecycleEvent,
		};

		if (this.agentManager) {
			await this.agentManager.restart({
				organizationId: options.organizationId,
				deviceId: this.hostConfig.deviceId,
			});
		} else {
			this.agentManager = new AgentManager(config);
			await this.agentManager.start();
		}
	}

	stop(): void {
		if (this.agentManager) {
			this.agentManager.stop();
			this.agentManager = null;
		}
	}

	hasWatcher(sessionId: string): boolean {
		return this.agentManager?.hasWatcher(sessionId) ?? false;
	}

	async ensureWatcher(
		sessionId: string,
		cwd?: string,
	): Promise<{ ready: boolean; reason?: string }> {
		if (!this.agentManager) {
			return { ready: false, reason: "Chat service is not started" };
		}
		return this.agentManager.ensureWatcher(sessionId, cwd);
	}
}
