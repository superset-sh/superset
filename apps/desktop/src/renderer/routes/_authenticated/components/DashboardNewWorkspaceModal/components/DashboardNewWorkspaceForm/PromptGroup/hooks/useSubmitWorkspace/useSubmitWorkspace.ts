import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { startableCloudEnvironments } from "@superset/shared/cloud-environments";
import { CLOUD_HOST_ID } from "@superset/shared/host-routing";
import type { RouterOutputs } from "@superset/trpc";
import { toast } from "@superset/ui/sonner";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useAwaitAcpChatEnabled } from "renderer/hooks/useAcpChatEnabled";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { acpHarnessForPreset } from "renderer/lib/acpHarness";
import { cloudTrpc, cloudTrpcClient } from "renderer/lib/cloud-trpc";
import {
	isSamePullRequest,
	pullRequestRefFromUrl,
} from "renderer/lib/github/pullRequestRef";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { NewWorkspacePromptContextApi } from "renderer/stores/new-workspace-prompt-context";
import { usePromptHistoryStore } from "renderer/stores/prompt-history";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";
import { queuePendingChatHandoff } from "renderer/stores/workspace-creates/queuePendingChatHandoff";
import { useDashboardNewWorkspaceDraft } from "../../../../../DashboardNewWorkspaceDraftContext";
import type { WorkspaceCreateAgent } from "../../types";
import type { UseUploadAttachmentsApi } from "../useUploadAttachments";
import { resolveNames } from "./resolveNames";

interface CloudBranch {
	branch: string;
	organizationId: string;
	environmentId: string;
	project: NonNullable<
		RouterOutputs["environment"]["list"][number]["gitlabProject"]
	>;
}

/**
 * Submits a workspace create against the new `workspaces.create` host
 * procedure. Attachment uploads run optimistically through `useUploadAttachments`
 * — submit only blocks on whatever uploads are still in flight, then dispatches
 * the create with the resulting `attachmentIds` on the agent launch sugar.
 */
export function useSubmitWorkspace(
	projectId: string | null,
	selectedAgent: WorkspaceCreateAgent,
	selectedPresetId: string | null,
	selectedModel: string | null,
	selectedEffort: string | null,
	selectedMode: string | null,
	uploadAttachments: UseUploadAttachmentsApi,
	promptContext: NewWorkspacePromptContextApi,
) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const { closeAndResetDraft, draft, resetKey } =
		useDashboardNewWorkspaceDraft();
	const { submit } = useWorkspaceCreates();
	const { machineId, activeHostUrl } = useLocalHostService();
	const collections = useCollections();
	const relayUrl = useRelayUrl();
	const activeOrganizationId = useActiveOrganizationId();
	const awaitAcpChatEnabled = useAwaitAcpChatEnabled();
	const createCloudWorkspace = cloudTrpc.cloudWorkspace.create.useMutation();
	const utils = cloudTrpc.useUtils();
	const environmentsQuery = cloudTrpc.environment.list.useQuery(
		{ organizationId: activeOrganizationId ?? "" },
		{ enabled: draft.hostId === CLOUD_HOST_ID && !!activeOrganizationId },
	);
	const displayedEnvironments = startableCloudEnvironments(
		environmentsQuery.data ?? [],
	);
	const displayedEnvironment =
		displayedEnvironments.find((row) => row.id === draft.environmentId) ??
		displayedEnvironments[0];
	const nativeCloud =
		draft.hostId === CLOUD_HOST_ID && !!displayedEnvironment?.gitlabProject;
	const nativeBinding = nativeCloud
		? JSON.stringify([
				activeOrganizationId,
				displayedEnvironment?.id,
				displayedEnvironment?.gitlabProject,
			])
		: null;
	const nativeReady =
		nativeCloud &&
		!environmentsQuery.isFetching &&
		!environmentsQuery.isError &&
		(!draft.environmentId || displayedEnvironment?.id === draft.environmentId);
	const currentNative = useRef({ binding: nativeBinding, ready: nativeReady });
	currentNative.current = { binding: nativeBinding, ready: nativeReady };
	const mounted = useRef(false);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	const isSession = draft.isSession;
	const selectionState = useMemo(
		() => ({
			projectId,
			activeOrganizationId,
			machineId,
			activeHostUrl,
			relayUrl,
			draft,
			resetKey,
			selectedAgent,
			selectedPresetId,
			selectedModel,
			selectedEffort,
			selectedMode,
		}),
		[
			projectId,
			activeOrganizationId,
			machineId,
			activeHostUrl,
			relayUrl,
			draft,
			resetKey,
			selectedAgent,
			selectedPresetId,
			selectedModel,
			selectedEffort,
			selectedMode,
		],
	);
	const currentSelection = useRef(selectionState);
	currentSelection.current = selectionState;

	// Submit is reachable from Cmd+Enter, the editor's Enter handler, and the
	// create button, and it awaits uploads / environment lookup / prompt
	// context before anything observable changes — `createCloudWorkspace.isPending`
	// is still false in that window, so without this latch a quick second
	// Cmd+Enter created a second workspace. Released in `finally` so a submit
	// that failed validation or errored can be retried.
	const inFlightRef = useRef(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const submitWorkspaceInner = useCallback(
		async (nativeBranch?: CloudBranch) => {
			if (nativeBranch) {
				const project = displayedEnvironment?.gitlabProject;
				if (
					!nativeCloud ||
					!project ||
					nativeBranch.organizationId !== activeOrganizationId ||
					nativeBranch.environmentId !== displayedEnvironment?.id ||
					nativeBranch.project.connectionId !== project.connectionId ||
					nativeBranch.project.projectId !== project.projectId ||
					nativeBranch.project.pathWithNamespace !==
						project.pathWithNamespace ||
					nativeBranch.project.cloneUrl !== project.cloneUrl
				)
					return;
			}
			const hostId = draft.hostId ?? machineId;
			const isCloud = hostId === CLOUD_HOST_ID;
			// A cloud workspace clones the one cloud repo, so it has no use for a
			// project — and the create surface hides the project picker when cloud
			// is the target, which would make this an unanswerable error.
			if (!projectId && !isSession && !isCloud) {
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

			if (!hostId) {
				toast.error(
					t({
						message: "No active host",
					}),
				);
				return;
			}

			const linkedRef =
				!isCloud && draft.linkedPR
					? pullRequestRefFromUrl(draft.linkedPR.url)
					: null;
			const isGitlabCheckout =
				!isCloud &&
				!!draft.linkedPR &&
				(linkedRef?.provider === "gitlab" ||
					/\/-\/merge_requests(?:\/|$)/i.test(draft.linkedPR.url));
			const refuseGitlab = () =>
				toast.error(t({ message: "Failed to prepare agent launch" }));
			if (
				isGitlabCheckout &&
				(!linkedRef ||
					linkedRef.provider !== "gitlab" ||
					!linkedRef.host ||
					linkedRef.number !== draft.linkedPR?.prNumber ||
					draft.selectedProjectId !== projectId)
			) {
				refuseGitlab();
				return;
			}
			const selection = selectionState;
			const draftIntent = (value: typeof draft) =>
				JSON.stringify({
					...value,
					attachments: value.attachments.map(({ localId, file }) => ({
						localId,
						file,
					})),
				});
			const intent = draftIntent(draft);
			const isCurrentSelection = () => {
				const current = currentSelection.current;
				return (
					current.projectId === selection.projectId &&
					current.activeOrganizationId === selection.activeOrganizationId &&
					current.machineId === selection.machineId &&
					current.activeHostUrl === selection.activeHostUrl &&
					current.relayUrl === selection.relayUrl &&
					current.resetKey === selection.resetKey &&
					current.selectedAgent === selection.selectedAgent &&
					current.selectedPresetId === selection.selectedPresetId &&
					current.selectedModel === selection.selectedModel &&
					current.selectedEffort === selection.selectedEffort &&
					current.selectedMode === selection.selectedMode &&
					draftIntent(current.draft) === intent
				);
			};
			const isCurrentNativeCloud = () =>
				mounted.current &&
				currentNative.current.ready &&
				currentNative.current.binding === nativeBinding &&
				isCurrentSelection();
			const guardsNativeCloud = () =>
				nativeCloud || currentNative.current.binding !== null;
			if (guardsNativeCloud() && !isCurrentNativeCloud()) return;
			const separator = linkedRef?.repoFullName.lastIndexOf("/") ?? -1;
			const expectedPullRequest =
				isGitlabCheckout && linkedRef?.host && projectId
					? {
							provider: "gitlab" as const,
							projectId,
							host: linkedRef.host,
							owner: linkedRef.repoFullName.slice(0, separator),
							repo: linkedRef.repoFullName.slice(separator + 1),
							pullNumber: linkedRef.number,
							expectedUrl: `https://${linkedRef.host}/${linkedRef.repoFullName.split("/").map(encodeURIComponent).join("/")}/-/merge_requests/${linkedRef.number}`,
						}
					: undefined;

			if (expectedPullRequest && !isCurrentSelection()) {
				refuseGitlab();
				return;
			}

			const {
				readyIds: attachmentIds,
				ready: readyAttachments,
				errors,
			} = await uploadAttachments.awaitUploads();
			if (guardsNativeCloud() && !isCurrentNativeCloud()) return;
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

			if (expectedPullRequest) {
				if (!isCurrentSelection()) {
					refuseGitlab();
					return;
				}
				const hostUrl = resolveHostUrl({
					hostId,
					machineId,
					activeHostUrl,
					organizationId: activeOrganizationId,
					relayUrl,
				});
				if (!hostUrl) {
					refuseGitlab();
					return;
				}
				try {
					const acknowledgement = await getHostServiceClientByUrl(
						hostUrl,
					).pullRequests.getLinkedWorkspace.query({
						projectId: expectedPullRequest.projectId,
						prNumber: expectedPullRequest.pullNumber,
						expectedPullRequest,
					});
					const validated =
						"validatedPullRequest" in acknowledgement
							? acknowledgement.validatedPullRequest
							: undefined;
					const canonicalRef = pullRequestRefFromUrl(
						expectedPullRequest.expectedUrl,
					);
					if (
						!isCurrentSelection() ||
						!canonicalRef ||
						!linkedRef ||
						!isSamePullRequest(canonicalRef, linkedRef) ||
						!validated ||
						validated.provider !== expectedPullRequest.provider ||
						validated.projectId !== expectedPullRequest.projectId ||
						validated.host !== expectedPullRequest.host ||
						validated.owner !== expectedPullRequest.owner ||
						validated.repo !== expectedPullRequest.repo ||
						validated.pullNumber !== expectedPullRequest.pullNumber ||
						validated.expectedUrl !== expectedPullRequest.expectedUrl
					) {
						refuseGitlab();
						return;
					}
				} catch {
					refuseGitlab();
					return;
				}
			}

			const { branchName, workspaceName } = resolveNames(draft);

			// Cloud workspaces are provisioned by the API, not the local host, so
			// they bypass the host `workspaces.create` path entirely.
			if (isCloud) {
				let environments: RouterOutputs["environment"]["list"];
				try {
					environments = await cloudTrpcClient.environment.list.query({
						organizationId: activeOrganizationId,
					});
				} catch (error) {
					if (!nativeCloud) throw error;
					if (isCurrentNativeCloud()) toast.error(errorMessage(error));
					return;
				}
				if (guardsNativeCloud() && !isCurrentNativeCloud()) return;
				const startable = startableCloudEnvironments(environments);
				const environment = nativeCloud
					? startable.find((row) => row.id === displayedEnvironment?.id)
					: (startable.find((row) => row.id === draft.environmentId) ??
						startable[0]);
				if (environment?.gitlabProject && !nativeCloud) return;
				if (nativeCloud) {
					const expected = displayedEnvironment?.gitlabProject,
						actual = environment?.gitlabProject;
					if (
						!expected ||
						!actual ||
						actual.connectionId !== expected.connectionId ||
						actual.projectId !== expected.projectId ||
						actual.pathWithNamespace !== expected.pathWithNamespace ||
						actual.cloneUrl !== expected.cloneUrl
					) {
						toast.error(t({ message: "Could not create cloud workspace" }));
						return;
					}
				}
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
					// is something to say to it. Attachments were uploaded to cloud
					// storage rather than a host, so the ids here are `files.id`s the
					// sandbox resolves and pulls once it is up.
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
					if (guardsNativeCloud() && !isCurrentNativeCloud()) return;
					const created = await createCloudWorkspace.mutateAsync({
						organizationId: activeOrganizationId,
						environmentId: environment.id,
						...(nativeCloud
							? { gitlabCloneUrl: environment.gitlabProject?.cloneUrl }
							: {}),
						name: workspaceName ?? undefined,
						// Linked PR and issue bodies can push this past the create input's
						// 20,000-character cap.
						prompt:
							(cloudPrompt ?? draft.prompt).trim().slice(0, 20_000) ||
							undefined,
						typedPrompt: draft.prompt.trim().slice(0, 20_000) || undefined,
						taskIds: draft.linkedIssues
							.flatMap((issue) =>
								issue.source === "internal" && issue.taskId
									? [issue.taskId]
									: [],
							)
							.slice(0, 10),
						branch:
							nativeBranch?.branch ??
							draft.baseBranch ??
							branchName ??
							undefined,
						...(attachmentIds.length > 0
							? { attachmentFileIds: attachmentIds }
							: {}),
						...(wantCloudAgent
							? {
									agent: selectedAgent,
									model: selectedModel ?? undefined,
									effort: selectedEffort ?? undefined,
									mode: selectedMode ?? undefined,
								}
							: {}),
					});
					if (guardsNativeCloud() && !isCurrentNativeCloud()) return;
					if (!nativeCloud) closeAndResetDraft();
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
					if (guardsNativeCloud() && !isCurrentNativeCloud()) return;
					utils.cloudWorkspace.list.setData(listInput, (rows) =>
						rows ? [created, ...rows] : [created],
					);
					if (nativeCloud) closeAndResetDraft();
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
					if (guardsNativeCloud() && !isCurrentNativeCloud()) return;
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
			// A PR always needs its own worktree; otherwise the picker decides.
			const isLocalCheckout = !isPrCheckout && draft.checkout === "local";

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

			if (expectedPullRequest && !isCurrentSelection()) {
				refuseGitlab();
				return;
			}

			const openAsChat =
				wantAgent &&
				Boolean(acpHarnessForPreset(selectedPresetId)) &&
				(await awaitAcpChatEnabled());
			if (expectedPullRequest && !isCurrentSelection()) {
				refuseGitlab();
				return;
			}
			const agents =
				wantAgent && !openAsChat
					? [
							{
								agent: selectedAgent,
								prompt: finalPrompt ?? "",
								attachmentIds:
									attachmentIds.length > 0 ? attachmentIds : undefined,
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
			const namingPrompt = openAsChat
				? (finalPrompt ?? trimmedPrompt).trim().slice(0, 20_000) || undefined
				: !wantAgent && trimmedPrompt
					? trimmedPrompt
					: undefined;
			const namingAgent = openAsChat ? selectedAgent : undefined;
			const workspaceId = crypto.randomUUID();
			const snapshot = isSession
				? {
						id: workspaceId,
						projectId: null,
						name: workspaceName ?? undefined,
						agents,
						namingPrompt,
						namingAgent,
					}
				: isLocalCheckout
					? {
							id: workspaceId,
							projectId: projectId as string,
							checkout: "local" as const,
							name: workspaceName ?? undefined,
							taskId: linkedTaskId,
							agents,
							namingPrompt,
							namingAgent,
						}
					: {
							id: workspaceId,
							projectId: projectId as string,
							name: isPrCheckout ? prName : (workspaceName ?? undefined),
							branch: isPrCheckout ? undefined : (branchName ?? undefined),
							skipBranchPrefix:
								!isPrCheckout &&
								branchName !== null &&
								draft.branchNameFromProvider
									? true
									: undefined,
							pr: isPrCheckout ? draft.linkedPR?.prNumber : undefined,
							...(expectedPullRequest ? { expectedPullRequest } : {}),
							baseBranch: draft.baseBranch ?? undefined,
							taskId: linkedTaskId,
							agents,
							namingPrompt: isPrCheckout ? undefined : namingPrompt,
							namingAgent: isPrCheckout ? undefined : namingAgent,
						};

			if (trimmedPrompt) {
				usePromptHistoryStore.getState().recordPrompt(trimmedPrompt);
			}

			if (openAsChat) {
				queuePendingChatHandoff(
					collections,
					{ id: workspaceId, projectId },
					{
						agentId: selectedAgent,
						prompt: finalPrompt ?? "",
						attachments: readyAttachments,
						modelId: selectedModel ?? undefined,
						modeId: selectedMode ?? undefined,
					},
				);
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
		},
		[
			activeOrganizationId,
			awaitAcpChatEnabled,
			collections,
			activeHostUrl,
			relayUrl,
			selectionState,
			nativeCloud,
			nativeBinding,
			displayedEnvironment,
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
			selectedPresetId,
			selectedModel,
			selectedEffort,
			selectedMode,
			submit,
			t,
			uploadAttachments,
			utils,
		],
	);

	const submitWorkspace = useCallback(
		async (nativeBranch?: CloudBranch) => {
			if (inFlightRef.current) return;
			inFlightRef.current = true;
			setIsSubmitting(true);
			try {
				await submitWorkspaceInner(nativeBranch);
			} catch (error) {
				if (!draft.linkedIssues.some((issue) => issue.source === "gitlab"))
					throw error;
				toast.error(errorMessage(error));
			} finally {
				inFlightRef.current = false;
				setIsSubmitting(false);
			}
		},
		[submitWorkspaceInner, draft.linkedIssues],
	);

	// Spans the whole submit — pending uploads, the cloud environment lookup,
	// and the create itself — so the submit control reads busy for exactly the
	// window in which a second activation would be dropped.
	return { submitWorkspace, isCreating: isSubmitting };
}
