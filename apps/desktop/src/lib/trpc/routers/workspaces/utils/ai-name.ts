import { createAnthropic } from "@ai-sdk/anthropic";
import { Agent } from "@mastra/core/agent";
import { getCredentialsFromAnySource } from "@superset/chat/host";

export async function generateWorkspaceNameFromPrompt(
	prompt: string,
): Promise<string | null> {
	try {
		const credentials = getCredentialsFromAnySource();
		const apiKey = credentials?.apiKey ?? null;
		if (!apiKey) return null;

		const anthropic = createAnthropic({ apiKey });

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
	} catch (error) {
		console.error("[workspace-ai-name] failed to generate workspace name", error);
		return null;
	}
}
