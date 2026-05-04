import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { authClient } from "renderer/lib/auth-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { NewWorkspacePromptContextApi } from "renderer/stores/new-workspace-prompt-context";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";
import { useDashboardNewWorkspaceDraft } from "../../../../../DashboardNewWorkspaceDraftContext";
import type { WorkspaceCreateAgent } from "../../types";
import type { UseUploadAttachmentsApi } from "../useUploadAttachments";
import { resolveNames } from "./resolveNames";

/**
 * Submits a workspace create against the new `workspaces.create` host
 * procedure. Attachment uploads run optimistically through `useUploadAttachments`
 * — submit only blocks on whatever uploads are still in flight, then dispatches
 * the create with the resulting `attachmentIds` on the agent launch sugar.
 */
export function useSubmitWorkspace(
	projectId: string | null,
	selectedAgent: WorkspaceCreateAgent,
	uploadAttachments: UseUploadAttachmentsApi,
	promptContext: NewWorkspacePromptContextApi,
) {
	const navigate = useNavigate();
	const { closeAndResetDraft, draft } = useDashboardNewWorkspaceDraft();
	const { submit } = useWorkspaceCreates();
	const { machineId } = useLocalHostService();
	const { data: session } = authClient.useSession();
	const activeOrganizationId = session?.session?.activeOrganizationId;

	return useCallback(async () => {
		if (!projectId) {
			toast.error("Select a project first");
			return;
		}
		if (!activeOrganizationId) {
			toast.error("No active organization");
			return;
		}

		const hostId = draft.hostId ?? machineId;
		if (!hostId) {
			toast.error("No active host");
			return;
		}

		const { readyIds: attachmentIds, errors } =
			await uploadAttachments.awaitUploads();
		if (errors.length > 0) {
			const first = errors[0];
			toast.error(
				first.filename
					? `Attachment upload failed (${first.filename}): ${first.message}`
					: `Attachment upload failed: ${first.message}`,
			);
			return;
		}

		const { branchName, workspaceName } = resolveNames(draft);

		const isPrCheckout = draft.linkedPR !== null;

		const linkedTaskId = draft.linkedIssues.find(
			(issue) => issue.source === "internal" && issue.taskId,
		)?.taskId;

		const hasAnyContext =
			!!draft.prompt.trim() ||
			draft.linkedPR !== null ||
			draft.linkedIssues.length > 0 ||
			attachmentIds.length > 0;
		const wantAgent = selectedAgent !== "none" && hasAnyContext;

		const finalPrompt = wantAgent
			? await promptContext.build({
					userPrompt: draft.prompt,
					linkedPR: draft.linkedPR,
					linkedIssues: draft.linkedIssues,
					timeoutMs: 2000,
				})
			: null;

		const agents = wantAgent
			? [
					{
						agent: selectedAgent,
						prompt: finalPrompt ?? "",
						attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
					},
				]
			: undefined;

		// PR path supplies a name (PR title) so the in-flight UI has
		// something to show immediately. Branch path leaves both `name`
		// and `branch` undefined when the user didn't type — the server
		// generates a friendly random and AI-renames whichever side(s)
		// the user didn't supply.
		const prName = isPrCheckout
			? draft.linkedPR?.title || `PR #${draft.linkedPR?.prNumber}`
			: undefined;

		const workspaceId = crypto.randomUUID();
		const snapshot = {
			id: workspaceId,
			projectId,
			name: isPrCheckout ? prName : (workspaceName ?? undefined),
			branch: isPrCheckout ? undefined : (branchName ?? undefined),
			pr: isPrCheckout ? draft.linkedPR?.prNumber : undefined,
			baseBranch: draft.baseBranch ?? undefined,
			taskId: linkedTaskId,
			agents,
		};

		closeAndResetDraft();
		void navigate({ to: `/v2-workspace/${workspaceId}` as string });
		void submit({ hostId, snapshot });
	}, [
		activeOrganizationId,
		closeAndResetDraft,
		draft,
		machineId,
		navigate,
		projectId,
		promptContext,
		selectedAgent,
		submit,
		uploadAttachments,
	]);
}
