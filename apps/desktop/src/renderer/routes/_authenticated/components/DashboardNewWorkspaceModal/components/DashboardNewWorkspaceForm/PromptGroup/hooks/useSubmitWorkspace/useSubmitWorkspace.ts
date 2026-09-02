import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc, cloudTrpcClient } from "renderer/lib/cloud-trpc";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { NewWorkspacePromptContextApi } from "renderer/stores/new-workspace-prompt-context";
import { usePromptHistoryStore } from "renderer/stores/prompt-history";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";
import { useDashboardNewWorkspaceDraft } from "../../../../../DashboardNewWorkspaceDraftContext";
import { CLOUD_HOST_ID } from "../../../components/DevicePicker/DevicePicker";
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
	selectedModel: string | null,
	selectedEffort: string | null,
	selectedMode: string | null,
	uploadAttachments: UseUploadAttachmentsApi,
	promptContext: NewWorkspacePromptContextApi,
) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const { closeAndResetDraft, draft } = useDashboardNewWorkspaceDraft();
	const { submit } = useWorkspaceCreates();
	const { machineId } = useLocalHostService();
	const activeOrganizationId = useActiveOrganizationId();
	const createCloudWorkspace = cloudTrpc.cloudWorkspace.create.useMutation();
	const utils = cloudTrpc.useUtils();

	const isSession = draft.isSession;

	const submitWorkspace = useCallback(async () => {
		if (!projectId && !isSession) {
			toast.error(
				t({
					message: "Select a project first",
				}),
			);
			return;
		}
		if (isSession && draft.linkedPR !== null) {
			toast.error(
				t({
					message: "Checking out a PR requires a project",
				}),
			);
			return;
		}
		if (!activeOrganizationId) {
			toast.error(
				t({
					message: "No active organization",
				}),
			);
			return;
		}

		const hostId = draft.hostId ?? machineId;
		if (!hostId) {
			toast.error(
				t({
					message: "No active host",
				}),
			);
			return;
		}

		const { readyIds: attachmentIds, errors } =
			await uploadAttachments.awaitUploads();
		if (errors.length > 0) {
			const first = errors[0];
			toast.error(
				first.filename
					? t({
							message: `Attachment upload failed (${first.filename}): ${first.message}`,
						})
					: t({
							message: `Attachment upload failed: ${first.message}`,
						}),
			);
			return;
		}

		const { branchName, workspaceName } = resolveNames(draft);

		// Cloud workspaces are provisioned by the API, not the local host, so
		// they bypass the host `workspaces.create` path entirely.
		if (hostId === CLOUD_HOST_ID) {
			const environments = await cloudTrpcClient.environment.list.query({
				organizationId: activeOrganizationId,
			});
			const environment =
				environments.find((row) => row.id === draft.environmentId) ??
				environments[0];
			if (!environment) {
				toast.error(
					t({
						message:
							"Add an environment in Settings before creating a cloud workspace",
					}),
				);
				return;
			}
			try {
				// A typed name wins; otherwise the API names it from the prompt,
				// since nothing about a cloud workspace runs on this device.
				// Returns as soon as the row exists — the sandbox is still being
				// provisioned behind it, which the workspace screen renders.
				// Same rule as a local create: an agent launches only when there
				// is something to say to it. Attachments stay behind — they are
				// written to a host, and this workspace's host doesn't exist yet.
				const wantCloudAgent =
					selectedAgent !== "none" &&
					(!!draft.prompt.trim() ||
						draft.linkedPR !== null ||
						draft.linkedIssues.length > 0);
				const cloudPrompt = wantCloudAgent
					? await promptContext.build({
							userPrompt: draft.prompt,
							linkedPR: draft.linkedPR,
							linkedIssues: draft.linkedIssues,
							timeoutMs: 2000,
						})
					: null;
				const created = await createCloudWorkspace.mutateAsync({
					organizationId: activeOrganizationId,
					environmentId: environment.id,
					name: workspaceName ?? undefined,
					// Linked PR and issue bodies can push this past the create input's
					// 20,000-character cap.
					prompt:
						(cloudPrompt ?? draft.prompt).trim().slice(0, 20_000) || undefined,
					branch: branchName ?? "main",
					...(wantCloudAgent
						? {
								agent: selectedAgent,
								model: selectedModel ?? undefined,
								effort: selectedEffort ?? undefined,
								mode: selectedMode ?? undefined,
							}
						: {}),
				});
				closeAndResetDraft();
				// The cloud list is what both the sidebar and the workspace route
				// read, and nothing used to tell it a workspace had been created —
				// the row appeared whenever the poll next came round, which is why
				// creating one felt like nothing had happened. Seeded rather than
				// only invalidated because the route we're about to open decides
				// between "provisioning" and "doesn't exist" off this list, and
				// even one refetch round trip is long enough to flash the wrong
				// one. Cancelled first so an in-flight fetch from before the
				// create can't land on top of the patch.
				const listInput = { organizationId: activeOrganizationId };
				await utils.cloudWorkspace.list.cancel(listInput);
				utils.cloudWorkspace.list.setData(listInput, (rows) =>
					rows ? [created, ...rows] : [created],
				);
				void navigate({
					to: "/v2-workspace/$workspaceId",
					params: { workspaceId: created.id },
				}).catch((error) => {
					console.error(
						"[useSubmitWorkspace] failed to open cloud workspace",
						error,
					);
				});
				// Server truth on top of the patch — the generated name lands here.
				void utils.cloudWorkspace.list.invalidate();
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: t({
								message: "Could not create cloud workspace",
							}),
				);
			}
			return;
		}

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
						model: selectedModel ?? undefined,
						effort: selectedEffort ?? undefined,
						mode: selectedMode ?? undefined,
					},
				]
			: undefined;

		// PR path supplies a name (PR title) so the in-flight UI has
		// something to show immediately. Branch path leaves both `name`
		// and `branch` undefined when the user didn't type — a typed name
		// seeds the branch slug; otherwise the server creates with a
		// friendly random and AI-renames once names arrive.
		const prName = isPrCheckout
			? draft.linkedPR?.title || `PR #${draft.linkedPR?.prNumber}`
			: undefined;

		const trimmedPrompt = draft.prompt.trim();
		const workspaceId = crypto.randomUUID();
		const snapshot = isSession
			? {
					id: workspaceId,
					projectId: null,
					name: workspaceName ?? undefined,
					agents,
					namingPrompt: !wantAgent && trimmedPrompt ? trimmedPrompt : undefined,
				}
			: {
					id: workspaceId,
					projectId: projectId as string,
					name: isPrCheckout ? prName : (workspaceName ?? undefined),
					branch: isPrCheckout ? undefined : (branchName ?? undefined),
					skipBranchPrefix:
						!isPrCheckout && branchName !== null && draft.branchNameFromProvider
							? true
							: undefined,
					pr: isPrCheckout ? draft.linkedPR?.prNumber : undefined,
					baseBranch: draft.baseBranch ?? undefined,
					taskId: linkedTaskId,
					agents,
					namingPrompt:
						!isPrCheckout && !wantAgent && trimmedPrompt
							? trimmedPrompt
							: undefined,
				};

		if (trimmedPrompt) {
			usePromptHistoryStore.getState().recordPrompt(trimmedPrompt);
		}

		closeAndResetDraft();
		const { completed } = submit({ hostId, snapshot });
		void navigate({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId },
		}).catch((error) => {
			console.error("[useSubmitWorkspace] failed to open workspace", error);
		});

		const isViewingOptimisticWorkspace = () => {
			const workspaceMatch = matchRoute({
				to: "/v2-workspace/$workspaceId",
			});
			return (
				workspaceMatch !== false && workspaceMatch.workspaceId === workspaceId
			);
		};

		void completed.then((outcome) => {
			if (!outcome.ok) return;

			// The server can resolve the optimistic workspace to a different
			// canonical id; follow it only if we're still on the optimistic route.
			if (outcome.workspaceId === workspaceId) return;
			if (!isViewingOptimisticWorkspace()) return;
			void navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: outcome.workspaceId },
				replace: true,
			}).catch((error) => {
				console.error(
					"[useSubmitWorkspace] failed to redirect workspace",
					error,
				);
			});
		});
	}, [
		activeOrganizationId,
		closeAndResetDraft,
		createCloudWorkspace,
		draft,
		isSession,
		matchRoute,
		machineId,
		navigate,
		projectId,
		promptContext,
		selectedAgent,
		selectedModel,
		selectedEffort,
		selectedMode,
		submit,
		t,
		uploadAttachments,
		utils,
	]);

	// Cloud creation is the one path the user waits on, now only for as long as
	// it takes to record the workspace — the sandbox comes up behind the
	// workspace screen. Returned so the submit control can carry its own
	// pending state for that moment rather than looking inert.
	return { submitWorkspace, isCreating: createCloudWorkspace.isPending };
}
