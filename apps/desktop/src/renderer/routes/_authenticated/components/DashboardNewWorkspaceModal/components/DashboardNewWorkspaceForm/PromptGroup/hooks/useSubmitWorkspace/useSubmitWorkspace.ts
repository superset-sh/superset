import { useProviderAttachments } from "@superset/ui/ai-elements/prompt-input";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { storeAttachments } from "renderer/lib/pending-attachment-store";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useDashboardNewWorkspaceDraft } from "../../../../../DashboardNewWorkspaceDraftContext";
import { resolveNames } from "./resolveNames";

/**
 * Returns a callback that submits a fork (new branch from base):
 * resolve names → store attachments → insert pending row → close modal →
 * navigate to pending page. The page owns the host-service mutation —
 * see V2_WORKSPACE_CREATION.md §3.
 */
export function useSubmitWorkspace(projectId: string | null) {
	const navigate = useNavigate();
	const { closeAndResetDraft, draft } = useDashboardNewWorkspaceDraft();
	const attachments = useProviderAttachments();
	const collections = useCollections();

	return useCallback(async () => {
		if (!projectId) {
			toast.error("Select a project first");
			return;
		}

		const { branchName, workspaceName } = resolveNames(draft);

		const pendingId = crypto.randomUUID();
		const detachedFiles = attachments.takeFiles();
		console.log("[v2-launch] submit: detachedFiles", {
			count: detachedFiles.length,
			entries: detachedFiles.map((f) => ({
				id: f.id,
				mediaType: f.mediaType,
				filename: f.filename,
				urlPrefix: f.url?.slice(0, 30),
				urlKind: f.url?.startsWith("blob:")
					? "blob"
					: f.url?.startsWith("data:")
						? "data"
						: "other",
			})),
		});
		if (detachedFiles.length > 0) {
			// Probe each URL before handing to storeAttachments so we know if
			// they're alive at submit-time (they should be — the provider
			// cleanup-on-unmount effect hasn't fired yet).
			for (const file of detachedFiles) {
				try {
					const probe = await fetch(file.url, { method: "GET" });
					console.log("[v2-launch] submit: url probe", {
						id: file.id,
						ok: probe.ok,
						status: probe.status,
						size: probe.headers.get("content-length"),
					});
				} catch (err) {
					console.warn("[v2-launch] submit: url probe FAILED", {
						id: file.id,
						url: file.url,
						error: err instanceof Error ? err.message : String(err),
					});
				}
			}
			try {
				await storeAttachments(pendingId, detachedFiles);
				console.log("[v2-launch] submit: storeAttachments OK", { pendingId });
			} catch (err) {
				console.error("[v2-launch] submit: storeAttachments FAILED", err);
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

		collections.pendingWorkspaces.insert({
			id: pendingId,
			projectId,
			intent: "fork",
			name: workspaceName,
			branchName,
			prompt: draft.prompt,
			baseBranch: draft.baseBranch ?? null,
			baseBranchSource: draft.baseBranchSource ?? null,
			runSetupScript: draft.runSetupScript,
			linkedIssues: draft.linkedIssues,
			linkedPR: draft.linkedPR,
			hostTarget: draft.hostTarget,
			attachmentCount: detachedFiles.length,
			status: "creating",
			error: null,
			workspaceId: null,
			warnings: [],
			createdAt: new Date(),
		});

		closeAndResetDraft();
		void navigate({ to: `/pending/${pendingId}` as string });
	}, [
		attachments,
		closeAndResetDraft,
		collections,
		draft,
		navigate,
		projectId,
	]);
}
