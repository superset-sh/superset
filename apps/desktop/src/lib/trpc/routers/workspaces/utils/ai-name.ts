import { createAnthropic } from "@ai-sdk/anthropic";
import { Agent } from "@mastra/core/agent";
import {
	getCredentialsFromConfig,
	getCredentialsFromKeychain,
} from "@superset/chat/host";
import { deriveWorkspaceBranchFromPrompt } from "shared/utils/workspace-naming";

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
