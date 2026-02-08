/**
 * Claude SDK Agent Provider
 *
 * Implements AgentProvider for the Claude SDK backend.
 * Delegates to the Claude agent endpoint (apps/streams) for execution
 * and reads back the provider session ID for multi-turn resume.
 */

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
	}: {
		sessionId: string;
		cwd: string;
	}): AgentRegistration {
		const env = buildClaudeEnv();

		return {
			id: "claude",
			endpoint: `${CLAUDE_AGENT_URL}/`,
			triggers: "user-messages",
			bodyTemplate: {
				sessionId,
				cwd,
				env,
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

	async cleanup(_sessionId: string): Promise<void> {
		// No-op — the agent endpoint manages its own state
	}
}
