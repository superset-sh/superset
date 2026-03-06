import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import {
	getCredentialsFromAnySource as getAnthropicCredentialsFromAnySource,
	getOpenAICredentialsFromAnySource,
} from "@superset/chat/host";
import { deriveWorkspaceBranchFromPrompt } from "shared/utils/workspace-naming";

type AgentModel = ConstructorParameters<typeof Agent>[0]["model"];

interface TitleProvider {
	name: "Anthropic" | "OpenAI";
	agentId: string;
	resolveApiKey: () => string | null;
	createModel: (apiKey: string) => AgentModel;
}

const TITLE_PROVIDERS: TitleProvider[] = [
	{
		name: "Anthropic",
		agentId: "workspace-namer-anthropic",
		resolveApiKey: () => getAnthropicCredentialsFromAnySource()?.apiKey ?? null,
		createModel: (apiKey) =>
			createAnthropic({ apiKey })("claude-haiku-4-5-20251001"),
	},
	{
		name: "OpenAI",
		agentId: "workspace-namer-openai",
		resolveApiKey: () => getOpenAICredentialsFromAnySource()?.apiKey ?? null,
		createModel: (apiKey) => createOpenAI({ apiKey })("gpt-4o-mini"),
	},
];

async function generateTitleWithModel(
	prompt: string,
	agentId: string,
	model: AgentModel,
): Promise<string | null> {
	const agent = new Agent({
		id: agentId,
		name: "Workspace Namer",
		instructions: "You generate concise workspace titles.",
		model,
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
	for (const provider of TITLE_PROVIDERS) {
		const apiKey = provider.resolveApiKey();
		if (!apiKey) {
			continue;
		}

		try {
			const title = await generateTitleWithModel(
				prompt,
				provider.agentId,
				provider.createModel(apiKey),
			);
			if (title) {
				return title;
			}
		} catch (error) {
			console.error(
				`[workspace-ai-name] ${provider.name} title generation failed`,
				error,
			);
		}
	}

	return null;
}

export async function generateWorkspaceBranchFromPrompt(
	prompt: string,
): Promise<string | null> {
	const fallbackBranchName = deriveWorkspaceBranchFromPrompt(prompt);

	try {
		const credentials =
			getCredentialsFromConfig() ?? getCredentialsFromKeychain();
		if (!credentials) return fallbackBranchName || null;

		const anthropic = createAnthropic({ apiKey: credentials.apiKey });

		const agent = new Agent({
			id: "workspace-branch-namer",
			name: "Workspace Branch Namer",
			instructions:
				"Generate exactly 2 or 3 short English keywords for a git branch. No punctuation. No prefixes like feat or fix.",
			model: anthropic("claude-haiku-4-5-20251001"),
		});

		const title = await agent.generateTitleFromUserMessage({
			message: prompt,
			tracingContext: {},
		});

		const branchName = deriveWorkspaceBranchFromPrompt(title ?? prompt);
		return branchName || fallbackBranchName || null;
	} catch (error) {
		console.warn("[generateWorkspaceBranchFromPrompt] AI branch naming failed", {
			error,
			promptLength: prompt.length,
		});
		return fallbackBranchName || null;
	}
}
