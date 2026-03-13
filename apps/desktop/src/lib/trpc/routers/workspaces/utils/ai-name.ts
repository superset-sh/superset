import {
	generateTitleFromMessage,
	generateTitleFromMessageWithStreamingModel,
} from "@superset/chat/host";
import { workspaces } from "@superset/local-db";
import { and, eq, isNull } from "drizzle-orm";
import {
	callSmallModel,
	type SmallModelAttempt,
} from "lib/ai/call-small-model";
import { localDb } from "main/lib/local-db";
import { deriveWorkspaceTitleFromPrompt } from "shared/utils/workspace-naming";
import { getWorkspaceAutoRenameDecision } from "./workspace-auto-rename";

export type WorkspaceAutoRenameResult =
	| {
			status: "renamed";
			name: string;
			warning?: string;
	  }
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

export async function generateWorkspaceNameFromPrompt(prompt: string): Promise<{
	name: string | null;
	usedPromptFallback: boolean;
	warning?: string;
}> {
	const { result, attempts } = await callSmallModel<string>({
		invoke: async ({ credentials, providerId, providerName, model }) => {
			if (providerId === "openai" && credentials.kind === "oauth") {
				return generateTitleFromMessageWithStreamingModel({
					message: prompt,
					model: model as never,
					instructions: "You generate concise workspace titles.",
				});
			}

			return generateTitleFromMessage({
				message: prompt,
				agentModel: model,
				agentId: `workspace-namer-${providerId}`,
				agentName: "Workspace Namer",
				instructions: "You generate concise workspace titles.",
				tracingContext: {
					surface: "workspace-auto-name",
					provider: providerName,
				},
			});
		},
	});
	if (result !== null && result !== undefined) {
		return { name: result, usedPromptFallback: false };
	}

	for (const attempt of attempts) {
		if (attempt.outcome === "failed") {
			console.error(
				`[workspace-ai-name] ${attempt.providerName} title generation failed`,
				{
					issue: attempt.issue ?? null,
					reason: attempt.reason ?? null,
				},
			);
			continue;
		}
		if (attempt.outcome === "unsupported-credentials") {
			console.info(
				`[workspace-ai-name] Skipping ${attempt.providerName} for title generation`,
				{
					issue: attempt.issue ?? attempt.reason,
				},
			);
		}
	}

	const fallbackTitle = deriveWorkspaceTitleFromPrompt(prompt);
	if (fallbackTitle) {
		console.info("[workspace-ai-name] Falling back to prompt-derived title");
		return {
			name: fallbackTitle,
			usedPromptFallback: true,
			warning: buildWorkspaceAutoNameFallbackWarning(attempts),
		};
	}

	return { name: null, usedPromptFallback: false };
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
	if (!workspace) {
		return { status: "skipped", reason: "missing-workspace" };
	}
	if (workspace.deletingAt != null) {
		return { status: "skipped", reason: "workspace-deleting" };
	}
	if (!workspace.isUnnamed) {
		return { status: "skipped", reason: "workspace-named" };
	}

	const {
		name: generatedName,
		usedPromptFallback,
		warning,
	} = await generateWorkspaceNameFromPrompt(cleanedPrompt);
	if (generatedName === null) {
		return {
			status: "skipped",
			reason: "generation-failed",
			warning: warning ?? "Couldn't auto-name this workspace.",
		};
	}

	const decision = getWorkspaceAutoRenameDecision({
		workspace,
		generatedName,
	});
	if (decision.kind === "skip") {
		return {
			status: "skipped",
			reason: decision.reason,
			...(warning ? { warning } : {}),
		};
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
				eq(workspaces.isUnnamed, true),
				isNull(workspaces.deletingAt),
			),
		)
		.run();
	if (renameResult.changes > 0) {
		return {
			status: "renamed",
			name: decision.name,
			warning: usedPromptFallback ? warning : undefined,
		};
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

function buildWorkspaceAutoNameFallbackWarning(
	attempts: SmallModelAttempt[],
): string {
	if (attempts.length === 0) {
		return "No model account was connected, so a prompt-based title was used.";
	}

	for (let index = attempts.length - 1; index >= 0; index -= 1) {
		const attempt = attempts[index];
		if (attempt.outcome === "expired-credentials") {
			return `${attempt.issue?.message ?? `${attempt.providerName} needs to be reconnected`}, so a prompt-based title was used.`;
		}
		if (attempt.outcome === "failed") {
			return `${attempt.issue?.message ?? `${attempt.providerName} couldn't generate a title`}, so a prompt-based title was used.`;
		}
		if (attempt.outcome === "unsupported-credentials") {
			return `${attempt.issue?.message ?? "No compatible model account was available"}, so a prompt-based title was used.`;
		}
	}

	const missingCredentials = attempts.every(
		(attempt) => attempt.outcome === "missing-credentials",
	);
	if (missingCredentials) {
		return "No model account was connected, so a prompt-based title was used.";
	}

	return "A prompt-based title was used because model naming was unavailable.";
}
