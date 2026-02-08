export interface AgentProviderSpec {
	id: string;
	name: string;
}

export interface AgentRegistration {
	id: string;
	endpoint: string;
	triggers: string;
	bodyTemplate: Record<string, unknown>;
}

export interface AgentProvider {
	readonly spec: AgentProviderSpec;

	getAgentRegistration(opts: {
		sessionId: string;
		cwd: string;
		paneId?: string;
		tabId?: string;
		workspaceId?: string;
		model?: string;
		permissionMode?: string;
	}): AgentRegistration;

	getProviderSessionId(sessionId: string): Promise<string | undefined>;

	cleanup(sessionId: string): Promise<void>;
}
