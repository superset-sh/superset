import { workspaces } from "@superset/local-db";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import {
	getCredentialsFromAnySource as getAnthropicCredentialsFromAnySource,
	getOpenAICredentialsFromAnySource,
} from "@superset/chat/host";
import { and, eq, isNull } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { getWorkspaceAutoRenameDecision } from "./workspace-auto-rename";

export type WorkspaceAutoRenameResult =
	| { status: "renamed"; name: string }
	| {
			status: "skipped";
			reason:
				| "empty-prompt"
				| "missing-credentials"
				| "generation-failed"
				| "missing-workspace"
				| "empty-generated-name"
				| "workspace-deleting"
				| "workspace-named"
				| "workspace-name-changed";
			warning?: string;
	  };

type AgentModel = ConstructorParameters<typeof Agent>[0]["model"];

interface TitleProvider {
	provider: "anthropic" | "openai";
	apiKey: string;
	agentId: string;
	modelId: string;
	createModel: (apiKey: string) => AgentModel;
}

function resolveTitleProviders(): TitleProvider[] {
	const providers: TitleProvider[] = [];

	const anthropicCredentials = getAnthropicCredentialsFromAnySource();
	if (anthropicCredentials) {
		providers.push({
			provider: "anthropic",
			apiKey: anthropicCredentials.apiKey,
			agentId: "workspace-namer-anthropic",
			modelId: "claude-haiku-4-5-20251001",
			createModel: (apiKey) =>
				createAnthropic({ apiKey })("claude-haiku-4-5-20251001"),
		});
	}

	const openAICredentials = getOpenAICredentialsFromAnySource();
	if (openAICredentials) {
		providers.push({
			provider: "openai",
			apiKey: openAICredentials.apiKey,
			agentId: "workspace-namer-openai",
			modelId: "gpt-4o-mini",
			createModel: (apiKey) => createOpenAI({ apiKey })("gpt-4o-mini"),
		});
	}

	return providers;
}

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
	const providers = resolveTitleProviders();
	if (providers.length === 0) {
		return null;
	}

	for (const provider of providers) {
		try {
			const title = await generateTitleWithModel(
				prompt,
				provider.agentId,
				provider.createModel(provider.apiKey),
			);
			if (title) {
				return title;
			}
		} catch (error) {
			console.error("[workspace-auto-name] Generation failed:", {
				provider: provider.provider,
				error,
			});
		}
	}

	return null;
}

export async function attemptWorkspaceAutoRenameFromPrompt({
	workspaceId,
	prompt,
}: {
	workspaceId: string;
	prompt?: string | null;
}): Promise<WorkspaceAutoRenameResult> {
	const cleanedPrompt = prompt?.trim();
	if (!cleanedPrompt) {
		return { status: "skipped", reason: "empty-prompt" };
	}

	const generatedName = await generateWorkspaceNameFromPrompt(cleanedPrompt);
	if (!generatedName) {
		const hasCredentials =
			getAnthropicCredentialsFromAnySource() !== null ||
			getOpenAICredentialsFromAnySource() !== null;
		return {
			status: "skipped",
			reason: hasCredentials ? "generation-failed" : "missing-credentials",
			warning: hasCredentials
				? "Couldn't auto-name this workspace."
				: "Couldn't auto-name this workspace because chat credentials aren't configured.",
		};
	}

	const workspace = localDb
		.select({
			branch: workspaces.branch,
			name: workspaces.name,
			isUnnamed: workspaces.isUnnamed,
			deletingAt: workspaces.deletingAt,
		})
		.from(workspaces)
		.where(and(eq(workspaces.id, workspaceId), isNull(workspaces.deletingAt)))
		.get();

	const decision = getWorkspaceAutoRenameDecision({
		workspace: workspace ?? null,
		generatedName,
	});
	if (decision.kind !== "rename") {
		return { status: "skipped", reason: decision.reason };
	}

	localDb
		.update(workspaces)
		.set({
			name: decision.name,
			isUnnamed: false,
			updatedAt: Date.now(),
		})
		.where(eq(workspaces.id, workspaceId))
		.run();

	return { status: "renamed", name: decision.name };
}
