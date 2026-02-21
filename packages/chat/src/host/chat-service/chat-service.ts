import { AgentManager, type AgentManagerConfig } from "./agent-manager";
import type { DataResolver } from "./data-resolver";

export interface ChatServiceHostConfig {
	deviceId: string;
	apiUrl: string;
	dataResolver?: DataResolver;
}

export class ChatService {
	private agentManager: AgentManager | null = null;
	private hostConfig: ChatServiceHostConfig;

	constructor(hostConfig: ChatServiceHostConfig) {
		this.hostConfig = hostConfig;
	}

	async start(options: {
		organizationId: string;
		authToken: string;
	}): Promise<void> {
		const config: AgentManagerConfig = {
			deviceId: this.hostConfig.deviceId,
			organizationId: options.organizationId,
			authToken: options.authToken,
			apiUrl: this.hostConfig.apiUrl,
			dataResolver: this.hostConfig.dataResolver,
		};

		if (this.agentManager) {
			await this.agentManager.restart({
				organizationId: options.organizationId,
				deviceId: this.hostConfig.deviceId,
				authToken: options.authToken,
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
	): Promise<{ ready: boolean; reason?: string }> {
		if (!this.agentManager) {
			return { ready: false, reason: "Chat service is not started" };
		}
		return this.agentManager.ensureWatcher(sessionId);
	}
}
