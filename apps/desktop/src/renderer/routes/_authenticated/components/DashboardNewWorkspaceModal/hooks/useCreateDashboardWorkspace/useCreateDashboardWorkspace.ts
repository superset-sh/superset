import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { env } from "renderer/env.renderer";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	useClearPendingWorkspace,
	useSetPendingWorkspace,
	useSetPendingWorkspaceStatus,
} from "renderer/stores/new-workspace-modal";
import { sanitizeBranchNameWithMaxLength } from "shared/utils/branch";
import type { WorkspaceHostTarget } from "../../components/DashboardNewWorkspaceForm/components/DevicePicker";
import type {
	LinkedIssue,
	LinkedPR,
} from "../../DashboardNewWorkspaceDraftContext";

// ── Utilities (pure functions, not hooks) ────────────────────────────

async function convertBlobUrlToDataUrl(url: string): Promise<string> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch attachment: ${response.statusText}`);
	}
	const blob = await response.blob();
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(reader.result as string);
		reader.onerror = () => reject(new Error("Failed to read attachment data"));
		reader.onabort = () => reject(new Error("Attachment read was aborted"));
		reader.readAsDataURL(blob);
	});
}

function revokeDetachedFiles(files: Array<{ url: string }>): void {
	for (const file of files) {
		if (file.url?.startsWith("blob:")) {
			URL.revokeObjectURL(file.url);
		}
	}
}

function resolveHostUrl(
	target: WorkspaceHostTarget,
	activeHostUrl: string | null,
): string | null {
	if (target.kind === "local") return activeHostUrl;
	return `${env.RELAY_URL}/hosts/${target.hostId}`;
}

// ── Types ────────────────────────────────────────────────────────────

export interface CreateWorkspaceInput {
	projectId: string;
	hostTarget: WorkspaceHostTarget;
	prompt: string;
	workspaceName?: string;
	branchName?: string;
	branchNameEdited: boolean;
	compareBaseBranch?: string;
	runSetupScript: boolean;
	linkedPR?: LinkedPR | null;
	linkedIssues: LinkedIssue[];
	attachmentFiles: Array<{ url: string; mediaType: string; filename?: string }>;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useCreateDashboardWorkspace() {
	const [isPending, setIsPending] = useState(false);
	const navigate = useNavigate();
	const { activeHostUrl } = useLocalHostService();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const setPendingWorkspace = useSetPendingWorkspace();
	const setPendingWorkspaceStatus = useSetPendingWorkspaceStatus();
	const clearPendingWorkspace = useClearPendingWorkspace();
	const generateBranchNameMutation =
		electronTrpc.workspaces.generateBranchName.useMutation();

	const createWorkspace = useCallback(
		async (input: CreateWorkspaceInput): Promise<void> => {
			if (isPending) return;
			setIsPending(true);

			const pendingId = crypto.randomUUID();
			const displayName =
				input.workspaceName?.trim() || input.prompt.trim() || "New workspace";
			const willGenerateAIName =
				!input.branchNameEdited && !!input.prompt.trim() && !input.linkedPR;

			setPendingWorkspace({
				id: pendingId,
				projectId: input.projectId,
				name: displayName,
				status: willGenerateAIName ? "generating-branch" : "preparing",
			});

			try {
				// 1. AI branch name generation
				let aiBranchName: string | null = null;
				if (willGenerateAIName) {
					try {
						const result = await Promise.race([
							generateBranchNameMutation.mutateAsync({
								prompt: input.prompt.trim(),
								projectId: input.projectId,
							}),
							new Promise<never>((_, reject) =>
								setTimeout(() => reject(new Error("timeout")), 30000),
							),
						]);
						aiBranchName = result.branchName;
					} catch (err) {
						// Non-fatal: fall through to branch name derived from
						// workspace name or prompt. Log so failures are observable.
						console.warn(
							"[useCreateDashboardWorkspace] AI branch name generation failed, falling back",
							err,
						);
					} finally {
						setPendingWorkspaceStatus(pendingId, "preparing");
					}
				}

				// 2. Convert attachment blob URLs to data URLs
				let attachments:
					| Array<{ data: string; mediaType: string; filename?: string }>
					| undefined;
				if (input.attachmentFiles.length > 0) {
					attachments = await Promise.all(
						input.attachmentFiles.map(async (file) => ({
							data: await convertBlobUrlToDataUrl(file.url),
							mediaType: file.mediaType,
							filename: file.filename,
						})),
					);
				}

				// 3. Resolve branch name
				const resolvedBranchName =
					(input.branchNameEdited && input.branchName?.trim()
						? sanitizeBranchNameWithMaxLength(
								input.branchName.trim(),
								undefined,
								{
									preserveCase: true,
								},
							)
						: aiBranchName) || undefined;

				// 4. Call host-service
				setPendingWorkspaceStatus(pendingId, "creating");

				const hostUrl = resolveHostUrl(input.hostTarget, activeHostUrl);
				if (!hostUrl) {
					throw new Error("Host service not available");
				}

				const client = getHostServiceClientByUrl(hostUrl);

				// Map linked issues into typed ID arrays
				const internalIssueIds = input.linkedIssues
					.filter((i) => i.source === "internal" && i.taskId)
					.map((i) => i.taskId as string);
				const githubIssueUrls = input.linkedIssues
					.filter((i) => i.source === "github" && i.url)
					.map((i) => i.url as string);

				const result = await client.workspaceCreation.create.mutate({
					projectId: input.projectId,
					source: input.linkedPR ? "pull-request" : "prompt",
					names: {
						workspaceName: input.workspaceName?.trim() || undefined,
						branchName: resolvedBranchName,
					},
					composer: {
						prompt: input.prompt.trim() || undefined,
						compareBaseBranch: input.compareBaseBranch || undefined,
						runSetupScript: input.runSetupScript,
					},
					linkedContext: {
						internalIssueIds:
							internalIssueIds.length > 0 ? internalIssueIds : undefined,
						githubIssueUrls:
							githubIssueUrls.length > 0 ? githubIssueUrls : undefined,
						linkedPrUrl: input.linkedPR?.url,
						attachments,
					},
					behavior: {
						onExistingWorkspace: "open",
						onExistingWorktree: "adopt",
					},
				});

				// 5. Handle outcome
				if (result.workspace) {
					ensureWorkspaceInSidebar(result.workspace.id, input.projectId);
					void navigateToV2Workspace(result.workspace.id, navigate);
				}

				if (result.outcome === "opened_existing_workspace") {
					toast.info("Opened existing workspace");
				} else {
					toast.success("Workspace created");
				}
			} catch (err) {
				toast.error(
					err instanceof Error ? err.message : "Failed to create workspace",
				);
			} finally {
				clearPendingWorkspace(pendingId);
				revokeDetachedFiles(input.attachmentFiles);
				setIsPending(false);
			}
		},
		[
			activeHostUrl,
			clearPendingWorkspace,
			ensureWorkspaceInSidebar,
			generateBranchNameMutation,
			isPending,
			navigate,
			setPendingWorkspace,
			setPendingWorkspaceStatus,
		],
	);

	return { createWorkspace, isPending };
}
