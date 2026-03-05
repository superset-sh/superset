import { createAnthropic } from "@ai-sdk/anthropic";
import { Agent } from "@mastra/core/agent";
import { getCredentialsFromAnySource } from "@superset/chat/host";

export async function generateWorkspaceNameFromPrompt(
	prompt: string,
): Promise<string | null> {
	try {
		const credentials = getCredentialsFromAnySource();
		const credentialSource = credentials?.source ?? null;
		const apiKey = credentials?.apiKey ?? null;

		console.debug("[workspace-ai-name] generate start", {
			promptLength: prompt.length,
			credentialSource,
		});
		if (!apiKey) {
			console.warn("[workspace-ai-name] missing credentials");
			return null;
		}

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

		const trimmedTitle = title?.trim() || null;
		console.debug("[workspace-ai-name] generate complete", {
			hasTitle: Boolean(trimmedTitle),
			titleLength: trimmedTitle?.length ?? 0,
		});
		return trimmedTitle;
	} catch (error) {
		console.warn("[workspace-ai-name] generate failed", error);
		return null;
	}
}
