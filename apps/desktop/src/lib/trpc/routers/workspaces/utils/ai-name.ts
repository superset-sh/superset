import { workspaces } from "@superset/local-db";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { and, eq, isNull } from "drizzle-orm";
import {
	getCredentialsFromAnySource,
	getOpenAICredentialsFromAnySource,
} from "@superset/chat/host";
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

type NamingProvider =
	| {
			provider: "anthropic";
			source: string;
			kind: string;
			model: ReturnType<typeof createAnthropic>;
			modelId: string;
	  }
	| {
			provider: "openai";
			source: string;
			kind: string;
			model: ReturnType<typeof createOpenAI>;
			modelId: string;
	  };

function resolveNamingProviders(): NamingProvider[] {
	const providers: NamingProvider[] = [];

	const anthropicCredentials = getCredentialsFromAnySource();
	if (anthropicCredentials) {
		const anthropic = createAnthropic({
			apiKey: anthropicCredentials.apiKey,
		});
		providers.push({
			provider: "anthropic",
			source: anthropicCredentials.source,
			kind: anthropicCredentials.kind,
			model: anthropic,
			modelId: "claude-haiku-4-5-20251001",
		});
	}

	const openAICredentials = getOpenAICredentialsFromAnySource();
	if (openAICredentials) {
		const openai = createOpenAI({
			apiKey: openAICredentials.apiKey,
		});
		providers.push({
			provider: "openai",
			source: openAICredentials.source,
			kind: openAICredentials.kind,
			model: openai,
			modelId: "gpt-4.1",
		});
	}

	return providers;
}

export async function generateWorkspaceNameFromPrompt(
	prompt: string,
): Promise<string | null> {
	console.log("[workspace-auto-name] Generating name", {
		promptLength: prompt.length,
		promptPreview: prompt.slice(0, 120),
	});

	const namingProviders = resolveNamingProviders();
	if (namingProviders.length === 0) {
		console.warn(
			"[workspace-auto-name] Skipping generation because no Anthropic or OpenAI credentials are available",
		);
		return null;
	}

	for (const namingProvider of namingProviders) {
		console.log("[workspace-auto-name] Using credentials", {
			provider: namingProvider.provider,
			source: namingProvider.source,
			kind: namingProvider.kind,
			modelId: namingProvider.modelId,
		});

		try {
			const agent = new Agent({
				id: "workspace-namer",
				name: "Workspace Namer",
				instructions: "You generate concise workspace titles.",
				model: namingProvider.model(namingProvider.modelId),
			});

			const title = await agent.generateTitleFromUserMessage({
				message: prompt,
				tracingContext: {},
			});

			const cleanedTitle = title?.trim() || null;
			console.log("[workspace-auto-name] Generation completed", {
				provider: namingProvider.provider,
				generatedName: cleanedTitle,
			});

			if (cleanedTitle) {
				return cleanedTitle;
			}
		} catch (error) {
			console.error("[workspace-auto-name] Generation failed:", {
				provider: namingProvider.provider,
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
			getCredentialsFromAnySource() !== null ||
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
