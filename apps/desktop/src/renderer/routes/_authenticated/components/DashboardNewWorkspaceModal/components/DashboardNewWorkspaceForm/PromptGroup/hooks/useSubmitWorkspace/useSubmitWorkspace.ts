import { useProviderAttachments } from "@superset/ui/ai-elements/prompt-input";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import {
	clearAttachments,
	storeAttachments,
} from "renderer/lib/pending-attachment-store";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useDashboardNewWorkspaceDraft } from "../../../../../DashboardNewWorkspaceDraftContext";
import { mapLinkedContext } from "./mapLinkedContext";
import { resolveNames } from "./resolveNames";

/**
 * Returns a callback that submits a new workspace:
 * resolve names → store attachments → insert pending row → close modal →
 * navigate to pending page → fire-and-forget host-service call →
 * update collection on resolve/reject.
 */
export function useSubmitWorkspace(projectId: string | null) {
	const navigate = useNavigate();
	const { closeAndResetDraft, createWorkspace, draft } =
		useDashboardNewWorkspaceDraft();
	const attachments = useProviderAttachments();
	const collections = useCollections();

	return useCallback(async () => {
		if (!projectId) {
			toast.error("Select a project first");
			return;
		}

		// 1. Resolve names
		const { branchName, workspaceName } = resolveNames(draft);

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
			name: workspaceName,
			branchName,
			prompt: draft.prompt,
			baseBranch: draft.baseBranch ?? null,
			runSetupScript: draft.runSetupScript,
			linkedIssues: draft.linkedIssues as unknown[],
			linkedPR: draft.linkedPR,
			hostTarget: draft.hostTarget,
			attachmentCount: detachedFiles.length,
			status: "creating",
			error: null,
			workspaceId: null,
			createdAt: new Date(),
		});

		// 4. Close modal, navigate to pending page
		closeAndResetDraft();
		void navigate({ to: `/pending/${pendingId}` as string });

		// 5. Fire create (fire-and-forget — closure survives modal unmount)
		const linked = mapLinkedContext(draft);

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
				// Non-fatal — create proceeds without attachments
			}
		}

		try {
			const result = await createWorkspace({
				pendingId,
				projectId,
				hostTarget: draft.hostTarget,
				names: { workspaceName, branchName },
				composer: {
					prompt: draft.prompt.trim() || undefined,
					baseBranch: draft.baseBranch || undefined,
					runSetupScript: draft.runSetupScript,
				},
				linkedContext: {
					...linked,
					attachments: attachmentPayload,
				},
			});

			collections.pendingWorkspaces.update(pendingId, (row) => {
				row.status = "succeeded";
				row.workspaceId = result.workspace?.id ?? null;
				row.terminals = result.terminals ?? [];
			});
			void clearAttachments(pendingId);
		} catch (err) {
			collections.pendingWorkspaces.update(pendingId, (row) => {
				row.status = "failed";
				row.error =
					err instanceof Error ? err.message : "Failed to create workspace";
			});
		}
	}, [
		attachments,
		closeAndResetDraft,
		collections,
		createWorkspace,
		draft,
		navigate,
		projectId,
	]);
}
