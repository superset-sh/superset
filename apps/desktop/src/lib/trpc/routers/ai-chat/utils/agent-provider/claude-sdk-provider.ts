import { PORTS } from "shared/constants";
import { env } from "shared/env.shared";
import { buildClaudeEnv } from "../auth";
import type {
	AgentProvider,
	AgentProviderSpec,
	AgentRegistration,
} from "./types";

const CLAUDE_AGENT_URL =
	process.env.CLAUDE_AGENT_URL || "http://localhost:9090";

export class ClaudeSdkProvider implements AgentProvider {
	readonly spec: AgentProviderSpec = {
		id: "claude-sdk",
		name: "Claude",
	};

	getAgentRegistration({
		sessionId,
		cwd,
		paneId,
		tabId,
		workspaceId,
		model,
		permissionMode,
	}: {
		sessionId: string;
		cwd: string;
		paneId?: string;
		tabId?: string;
		workspaceId?: string;
		model?: string;
		permissionMode?: string;
	}): AgentRegistration {
		const claudeEnv = buildClaudeEnv();

		return {
			id: "claude",
			endpoint: `${CLAUDE_AGENT_URL}/`,
			triggers: "user-messages",
			bodyTemplate: {
				sessionId,
				cwd,
				env: claudeEnv,
				notification: {
					port: PORTS.NOTIFICATIONS,
					paneId,
					tabId,
					workspaceId,
					env: env.NODE_ENV === "development" ? "development" : "production",
				},
				...(model && { model }),
				...(permissionMode && { permissionMode }),
			},
		};
	}

	async getProviderSessionId(sessionId: string): Promise<string | undefined> {
		try {
			const res = await fetch(`${CLAUDE_AGENT_URL}/sessions/${sessionId}`);
			if (!res.ok) return undefined;

			const data = (await res.json()) as {
				claudeSessionId?: string;
			};
			return data.claudeSessionId;
		} catch {
			return undefined;
		}
	}

	async cleanup(_sessionId: string): Promise<void> {}
}
