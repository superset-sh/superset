import { createAnthropic } from "@ai-sdk/anthropic";
import { Agent } from "@mastra/core/agent";
import {
	getCredentialsFromConfig,
	getCredentialsFromKeychain,
} from "@superset/chat/host";

export async function generateWorkspaceNameFromPrompt(
	prompt: string,
): Promise<string | null> {
	try {
		const credentials =
			getCredentialsFromConfig() ?? getCredentialsFromKeychain();
		if (!credentials) return null;

		const anthropic = createAnthropic({ apiKey: credentials.apiKey });

		const agent = new Agent({
			id: "workspace-namer",
			name: "Workspace Namer",
			instructions: "You generate concise workspace titles.",
			model: anthropic("claude-haiku-4-5-20251001"),
		});

		const title = await agent.generateTitleFromUserMessage({
			message: prompt,
			tracingContext: {},
		});

		return title?.trim() || null;
	} catch {
		return null;
	}
}
