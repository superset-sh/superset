import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import {
	generateTitleFromMessage,
	getCredentialsFromAnySource as getAnthropicCredentialsFromAnySource,
	getAnthropicProviderOptions,
	getOpenAICredentialsFromAnySource,
} from "@superset/chat/host";
import { workspaces } from "@superset/local-db";
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

type AgentModel = Extract<
	Parameters<typeof generateTitleFromMessage>[0],
	{ agentModel: unknown }
>["agentModel"];
type AnthropicCredentials = NonNullable<
	ReturnType<typeof getAnthropicCredentialsFromAnySource>
>;
type OpenAICredentials = NonNullable<
	ReturnType<typeof getOpenAICredentialsFromAnySource>
>;

interface TitleProvider {
	name: "Anthropic" | "OpenAI";
	agentId: string;
	resolveCredentials: () => AnthropicCredentials | OpenAICredentials | null;
	createModel: (
		credentials: AnthropicCredentials | OpenAICredentials,
	) => AgentModel;
}

const TITLE_PROVIDERS: TitleProvider[] = [
	{
		name: "Anthropic",
		agentId: "workspace-namer-anthropic",
		resolveCredentials: () => getAnthropicCredentialsFromAnySource(),
		createModel: (credentials) =>
			createAnthropic(getAnthropicProviderOptions(credentials))(
				"claude-haiku-4-5-20251001",
			),
	},
	{
		name: "OpenAI",
		agentId: "workspace-namer-openai",
		resolveCredentials: () => getOpenAICredentialsFromAnySource(),
		createModel: (credentials) =>
			createOpenAI({ apiKey: credentials.apiKey })("gpt-4o-mini"),
	},
];

export async function generateWorkspaceNameFromPrompt(
	prompt: string,
): Promise<string | null> {
	for (const provider of TITLE_PROVIDERS) {
		const credentials = provider.resolveCredentials();
		if (!credentials) {
			continue;
		}

		try {
			const title = await generateTitleFromMessage({
				message: prompt,
				agentModel: provider.createModel(credentials),
				agentId: provider.agentId,
				agentName: "Workspace Namer",
				instructions: "You generate concise workspace titles.",
			});
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
		if (!hasCredentials) {
			// No credentials configured — silently skip. This is expected for users
			// who haven't set up API keys; showing a toast would be confusing noise.
			return { status: "skipped", reason: "missing-credentials" };
		}
		return {
			status: "skipped",
			reason: "generation-failed",
			warning: "Couldn't auto-name this workspace.",
		};
	}

	const workspace = localDb
		.select({
			id: workspaces.id,
			branch: workspaces.branch,
			name: workspaces.name,
			isUnnamed: workspaces.isUnnamed,
			deletingAt: workspaces.deletingAt,
		})
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.get();

	const decision = getWorkspaceAutoRenameDecision({
		workspace: workspace ?? null,
		generatedName,
	});
	if (decision.kind === "skip") {
		return { status: "skipped", reason: decision.reason };
	}
	if (!workspace) {
		return { status: "skipped", reason: "missing-workspace" };
	}

	const renameResult = localDb
		.update(workspaces)
		.set({
			name: decision.name,
			isUnnamed: false,
			updatedAt: Date.now(),
		})
		.where(
			and(
				eq(workspaces.id, workspace.id),
				eq(workspaces.branch, workspace.branch),
				eq(workspaces.name, workspace.branch),
				eq(workspaces.isUnnamed, true),
				isNull(workspaces.deletingAt),
			),
		)
		.run();
	if (renameResult.changes > 0) {
		return { status: "renamed", name: decision.name };
	}

	const latestWorkspace = localDb
		.select({
			branch: workspaces.branch,
			name: workspaces.name,
			isUnnamed: workspaces.isUnnamed,
			deletingAt: workspaces.deletingAt,
		})
		.from(workspaces)
		.where(eq(workspaces.id, workspace.id))
		.get();

	const latestDecision = getWorkspaceAutoRenameDecision({
		workspace: latestWorkspace ?? null,
		generatedName,
	});
	return {
		status: "skipped",
		reason:
			latestDecision.kind === "skip"
				? latestDecision.reason
				: "workspace-name-changed",
	};
}
