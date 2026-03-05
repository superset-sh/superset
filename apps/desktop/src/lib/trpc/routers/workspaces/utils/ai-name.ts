import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import {
	getCredentialsFromAnySource as getAnthropicCredentialsFromAnySource,
	getOpenAICredentialsFromAnySource,
} from "@superset/chat/host";

async function generateTitleWithAnthropic(
	prompt: string,
	apiKey: string,
): Promise<string | null> {
	const anthropic = createAnthropic({ apiKey });
	const agent = new Agent({
		id: "workspace-namer-anthropic",
		name: "Workspace Namer",
		instructions: "You generate concise workspace titles.",
		model: anthropic("claude-haiku-4-5-20251001"),
	});

	const title = await agent.generateTitleFromUserMessage({
		message: prompt,
		tracingContext: {},
	});

	return title?.trim() || null;
}

async function generateTitleWithOpenAI(
	prompt: string,
	apiKey: string,
): Promise<string | null> {
	const openai = createOpenAI({ apiKey });
	const agent = new Agent({
		id: "workspace-namer-openai",
		name: "Workspace Namer",
		instructions: "You generate concise workspace titles.",
		model: openai("gpt-4o-mini"),
	});

	const title = await agent.generateTitleFromUserMessage({
		message: prompt,
		tracingContext: {},
	});

	return title?.trim() || null;
}

export async function generateWorkspaceNameFromPrompt(
	prompt: string,
): Promise<string | null> {
	const anthropicCredentials = getAnthropicCredentialsFromAnySource();
	if (anthropicCredentials?.apiKey) {
		try {
			const title = await generateTitleWithAnthropic(
				prompt,
				anthropicCredentials.apiKey,
			);
			if (title) {
				return title;
			}
		} catch (error) {
			console.error(
				"[workspace-ai-name] Anthropic title generation failed, trying OpenAI fallback",
				error,
			);
		}
	}

	const openAICredentials = getOpenAICredentialsFromAnySource();
	if (!openAICredentials?.apiKey) {
		return null;
	}

	try {
		return await generateTitleWithOpenAI(prompt, openAICredentials.apiKey);
	} catch (error) {
		console.error(
			"[workspace-ai-name] OpenAI fallback title generation failed",
			error,
		);
		return null;
	}
}
