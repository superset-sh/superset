import { generateTitleFromMessage } from "@superset/chat/server/desktop";
import { getSmallModel } from "@superset/chat/server/shared";
import { workspaces } from "@superset/local-db";
import { deriveWorkspaceTitleFromPrompt } from "@superset/shared/workspace-launch";
import { and, eq, isNull } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
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

const FALLBACK_WARNING =
	"A prompt-based title was used because model naming was unavailable.";

export async function generateWorkspaceNameFromPrompt(prompt: string): Promise<{
	name: string | null;
	usedPromptFallback: boolean;
	warning?: string;
}> {
	const model = await getSmallModel();
	if (model) {
		try {
			const generated = await generateTitleFromMessage({
				message: prompt,
				agentModel: model,
				agentId: "workspace-namer",
				agentName: "Workspace Namer",
				instructions:
					"You generate concise workspace titles. 20 characters or less. Return ONLY the title, nothing else.",
				tracingContext: { surface: "workspace-auto-name" },
			});
			if (generated !== null && generated !== undefined) {
				return { name: generated, usedPromptFallback: false };
			}
		} catch (error) {
			console.error("[workspace-ai-name] title generation failed", error);
		}
	}

	const fallbackTitle = deriveWorkspaceTitleFromPrompt(prompt);
	if (fallbackTitle) {
		return {
			name: fallbackTitle,
			usedPromptFallback: true,
			warning: FALLBACK_WARNING,
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
