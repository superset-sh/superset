import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { storeAttachments } from "renderer/lib/pending-attachment-store";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useDashboardNewWorkspaceDraft } from "../../../../../DashboardNewWorkspaceDraftContext";
import { resolveNames } from "./resolveNames";

export interface SubmitAttachment {
	url: string; // data: URL already (library converts blob→data before onSubmit)
	mediaType: string;
	filename?: string;
}

/**
 * Returns a callback that submits a fork (new branch from base):
 * resolve names → store attachments → insert pending row → close modal →
 * navigate to pending page. The page owns the host-service mutation —
 * see V2_WORKSPACE_CREATION.md §3.
 *
 * Files come via the PromptInput's `onSubmit({ text, files })` payload
 * (already converted from blob: → data: by the library before it calls
 * us). We do not read from `useProviderAttachments().takeFiles()` here:
 * the library clears provider state + revokes blob URLs *before*
 * invoking onSubmit, so the ref is stale by the time we'd see it.
 */
export function useSubmitWorkspace(projectId: string | null) {
	const navigate = useNavigate();
	const { closeAndResetDraft, draft } = useDashboardNewWorkspaceDraft();
	const collections = useCollections();

	return useCallback(
		async (files: SubmitAttachment[] = []) => {
			if (!projectId) {
				toast.error("Select a project first");
				return;
			}

			const { branchName, workspaceName } = resolveNames(draft);
			const pendingId = crypto.randomUUID();

			// PR mode: route to pr-checkout intent. Pending page fetches full
			// PR details (getGitHubPullRequestContent) before firing the
			// mutation, and derives the real branch name server-side from the
			// resolved PR data. The `branchName` field here is a display
			// placeholder; workspaceName similarly falls back to the PR title.
			const isPrCheckout = draft.linkedPR !== null;
			const prPlaceholderBranch = isPrCheckout
				? `pr-${draft.linkedPR?.prNumber}`
				: null;
			const prPlaceholderName = isPrCheckout
				? draft.linkedPR?.title || `PR #${draft.linkedPR?.prNumber}`
				: null;

			if (files.length > 0) {
				try {
					await storeAttachments(pendingId, files);
				} catch (err) {
					toast.error(
						err instanceof Error ? err.message : "Failed to store attachments",
					);
					return;
				}
			}

			collections.pendingWorkspaces.insert({
				id: pendingId,
				projectId,
				intent: isPrCheckout ? "pr-checkout" : "fork",
				name: prPlaceholderName ?? workspaceName,
				branchName: prPlaceholderBranch ?? branchName,
				prompt: draft.prompt,
				baseBranch: draft.baseBranch ?? null,
				baseBranchSource: draft.baseBranchSource ?? null,
				runSetupScript: draft.runSetupScript,
				linkedIssues: draft.linkedIssues,
				linkedPR: draft.linkedPR,
				hostTarget: draft.hostTarget,
				attachmentCount: files.length,
				status: "creating",
				error: null,
				workspaceId: null,
				warnings: [],
				createdAt: new Date(),
			});

			closeAndResetDraft();
			void navigate({ to: `/pending/${pendingId}` as string });
		},
		[closeAndResetDraft, collections, draft, navigate, projectId],
	);
}
