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
	source: string;
	kind: string;
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
			source: anthropicCredentials.source,
			kind: anthropicCredentials.kind,
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
			source: openAICredentials.source,
			kind: openAICredentials.kind,
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
	console.log("[workspace-auto-name] Generating name", {
		promptLength: prompt.length,
		promptPreview: prompt.slice(0, 120),
	});

	const providers = resolveTitleProviders();
	if (providers.length === 0) {
		console.warn(
			"[workspace-auto-name] Skipping generation because no Anthropic or OpenAI credentials are available",
		);
		return null;
	}

	for (const provider of providers) {
		console.log("[workspace-auto-name] Using credentials", {
			provider: provider.provider,
			source: provider.source,
			kind: provider.kind,
			modelId: provider.modelId,
		});

		try {
			const title = await generateTitleWithModel(
				prompt,
				provider.agentId,
				provider.createModel(provider.apiKey),
			);
			console.log("[workspace-auto-name] Generation completed", {
				provider: provider.provider,
				generatedName: title,
			});
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
		console.log("[workspace-auto-name] Skipping rename because prompt is empty", {
			workspaceId,
		});
		return { status: "skipped", reason: "empty-prompt" };
	}

	console.log("[workspace-auto-name] Attempting rename", {
		workspaceId,
		promptLength: cleanedPrompt.length,
		promptPreview: cleanedPrompt.slice(0, 120),
	});

	const generatedName = await generateWorkspaceNameFromPrompt(cleanedPrompt);
	if (!generatedName) {
		const hasCredentials =
			getAnthropicCredentialsFromAnySource() !== null ||
			getOpenAICredentialsFromAnySource() !== null;
		console.warn(
			"[workspace-auto-name] Skipping rename because generation returned no name",
			{ workspaceId, hasCredentials },
		);
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
		console.log("[workspace-auto-name] Skipping rename", {
			workspaceId,
			reason: decision.reason,
			workspace,
			generatedName,
		});
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

	console.log("[workspace-auto-name] Renamed workspace", {
		workspaceId,
		fromName: workspace?.name ?? null,
		toName: decision.name,
	});

	return { status: "renamed", name: decision.name };
}
