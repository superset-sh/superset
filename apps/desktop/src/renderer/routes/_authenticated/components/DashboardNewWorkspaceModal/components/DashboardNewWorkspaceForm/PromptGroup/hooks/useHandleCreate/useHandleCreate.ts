import { useProviderAttachments } from "@superset/ui/ai-elements/prompt-input";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import {
	clearAttachments,
	storeAttachments,
} from "renderer/lib/pending-attachment-store";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { sanitizeBranchNameWithMaxLength } from "shared/utils/branch";
import { generateFriendlyBranchName } from "shared/utils/friendly-branch-name";
import { useDashboardNewWorkspaceDraft } from "../../../../../DashboardNewWorkspaceDraftContext";

/**
 * Encapsulates the full "create workspace" flow:
 * compute names → store attachments → insert pending row → close modal →
 * navigate to pending page → fire-and-forget host-service call →
 * update collection on resolve/reject.
 */
export function useHandleCreate(projectId: string | null) {
	const navigate = useNavigate();
	const { closeAndResetDraft, createWorkspace, draft } =
		useDashboardNewWorkspaceDraft();
	const attachments = useProviderAttachments();
	const collections = useCollections();

	const {
		branchName,
		branchNameEdited,
		baseBranch,
		hostTarget,
		linkedIssues,
		linkedPR,
		prompt,
		runSetupScript,
		workspaceName,
		workspaceNameEdited,
	} = draft;
	const trimmedPrompt = prompt.trim();

	return useCallback(async () => {
		if (!projectId) {
			toast.error("Select a project first");
			return;
		}

		// 1. Compute names — generate once, use for both branch + workspace
		const friendlyFallback = generateFriendlyBranchName();
		const resolvedBranchName =
			branchNameEdited && branchName.trim()
				? sanitizeBranchNameWithMaxLength(branchName.trim(), undefined, {
						preserveCase: true,
					})
				: trimmedPrompt
					? sanitizeBranchNameWithMaxLength(trimmedPrompt)
					: friendlyFallback;

		const resolvedWorkspaceName =
			workspaceNameEdited && workspaceName.trim()
				? workspaceName.trim()
				: trimmedPrompt || friendlyFallback;

		// 2. Store attachments in IndexedDB before closing modal
		const pendingId = crypto.randomUUID();
		const detachedFiles = attachments.takeFiles();
		if (detachedFiles.length > 0) {
			try {
				await storeAttachments(pendingId, detachedFiles);
			} catch (err) {
				toast.error(
					err instanceof Error ? err.message : "Failed to store attachments",
				);
				return;
			} finally {
				for (const file of detachedFiles) {
					if (file.url?.startsWith("blob:")) URL.revokeObjectURL(file.url);
				}
			}
		}

		// 3. Insert pending workspace (full draft for retry)
		collections.pendingWorkspaces.insert({
			id: pendingId,
			projectId,
			name: resolvedWorkspaceName,
			branchName: resolvedBranchName,
			prompt,
			baseBranch: baseBranch ?? null,
			runSetupScript,
			linkedIssues: linkedIssues as unknown[],
			linkedPR,
			hostTarget,
			attachmentCount: detachedFiles.length,
			status: "creating",
			error: null,
			workspaceId: null,
			initialCommands: null,
			createdAt: new Date(),
		});

		// 4. Close modal, navigate to pending page
		closeAndResetDraft();
		void navigate({ to: `/pending/${pendingId}` as string });

		// 5. Fire create (fire-and-forget)
		const internalIssueIds = linkedIssues
			.filter((i) => i.source === "internal" && i.taskId)
			.map((i) => i.taskId as string);
		const githubIssueUrls = linkedIssues
			.filter((i) => i.source === "github" && i.url)
			.map((i) => i.url as string);

		let attachmentPayload:
			| Array<{ data: string; mediaType: string; filename: string }>
			| undefined;
		if (detachedFiles.length > 0) {
			try {
				const { loadAttachments } = await import(
					"renderer/lib/pending-attachment-store"
				);
				attachmentPayload = await loadAttachments(pendingId);
			} catch {
				// Non-fatal
			}
		}

		try {
			const result = await createWorkspace({
				pendingId,
				projectId,
				hostTarget,
				names: {
					workspaceName: resolvedWorkspaceName,
					branchName: resolvedBranchName,
				},
				composer: {
					prompt: trimmedPrompt || undefined,
					baseBranch: baseBranch || undefined,
					runSetupScript,
				},
				linkedContext: {
					internalIssueIds:
						internalIssueIds.length > 0 ? internalIssueIds : undefined,
					githubIssueUrls:
						githubIssueUrls.length > 0 ? githubIssueUrls : undefined,
					linkedPrUrl: linkedPR?.url,
					attachments: attachmentPayload,
				},
			});

			collections.pendingWorkspaces.update(pendingId, (draft) => {
				draft.status = "succeeded";
				draft.workspaceId = result.workspace?.id ?? null;
				draft.initialCommands = result.initialCommands ?? null;
			});
			void clearAttachments(pendingId);
		} catch (err) {
			collections.pendingWorkspaces.update(pendingId, (draft) => {
				draft.status = "failed";
				draft.error =
					err instanceof Error ? err.message : "Failed to create workspace";
			});
		}
	}, [
		attachments,
		branchName,
		branchNameEdited,
		closeAndResetDraft,
		collections,
		baseBranch,
		createWorkspace,
		hostTarget,
		linkedIssues,
		linkedPR,
		navigate,
		projectId,
		prompt,
		runSetupScript,
		trimmedPrompt,
		workspaceName,
		workspaceNameEdited,
	]);
}
