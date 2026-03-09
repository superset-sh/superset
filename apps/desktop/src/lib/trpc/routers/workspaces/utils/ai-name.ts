import { generateTitleFromMessage } from "@superset/chat/host";
import { workspaces } from "@superset/local-db";
import { and, eq, isNull } from "drizzle-orm";
import { callSmallModel } from "lib/ai/call-small-model";
import { localDb } from "main/lib/local-db";
import { deriveWorkspaceTitleFromPrompt } from "shared/utils/workspace-naming";
import {
	createWorkspaceAutoRenameWarning,
	type WorkspaceAutoRenameWarning,
} from "shared/workspace-auto-rename-warning";
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
			warning?: WorkspaceAutoRenameWarning;
	  };

export async function generateWorkspaceNameFromPrompt(
	prompt: string,
): Promise<string | null> {
	const { result, attempts } = await callSmallModel<string>({
		invoke: async ({ providerId, providerName, model }) => {
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
	if (result) {
		return result;
	}

	for (const attempt of attempts) {
		if (attempt.outcome === "failed") {
			console.error(
				`[workspace-ai-name] ${attempt.providerName} title generation failed`,
				attempt.reason,
			);
			continue;
		}
		if (attempt.outcome === "unsupported-credentials") {
			console.info(
				`[workspace-ai-name] Skipping ${attempt.providerName} for title generation`,
				{
					reason: attempt.reason,
					credentialKind: attempt.credentialKind,
					credentialSource: attempt.credentialSource,
				},
			);
		}
	}

	const fallbackTitle = deriveWorkspaceTitleFromPrompt(prompt);
	if (fallbackTitle) {
		console.info("[workspace-ai-name] Falling back to prompt-derived title");
		return fallbackTitle;
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
		return {
			status: "skipped",
			reason: "generation-failed",
			warning: createWorkspaceAutoRenameWarning("generation-failed"),
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
