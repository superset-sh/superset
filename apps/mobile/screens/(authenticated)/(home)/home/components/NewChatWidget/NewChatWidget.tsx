import { useLingui } from "@lingui/react/macro";
import { Composer, type ComposerHandle } from "@superset/composer";
import { isCloudAgentId } from "@superset/shared/cloud-agent-launch";
import { getPresetById } from "@superset/shared/host-agent-presets";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { useCloudEnvironments } from "@/hooks/useCloudEnvironments";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import { useSession } from "@/lib/auth/client";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { posthog } from "@/lib/posthog";
import { apiClient } from "@/lib/trpc/client";
import { useWorkspaceScope } from "@/screens/(authenticated)/(home)/hooks/useWorkspaceScope";
import { useAttachmentsSheet } from "@/screens/(authenticated)/hooks/useAttachmentsSheet";
import { useComposerDraft } from "@/screens/(authenticated)/hooks/useComposerDraft";
import { useCreateTerminalWorkspace } from "@/screens/(authenticated)/hooks/useCreateTerminalWorkspace";
import { useHostAgentConfigs } from "@/screens/(authenticated)/hooks/useHostAgentConfigs";
import { usePasteAttachments } from "@/screens/(authenticated)/hooks/usePasteAttachments";
import { HOME_DRAFT_KEY } from "@/screens/(authenticated)/stores/composerDraftsStore";
import { useComposerFocusStore } from "../../stores/composerFocusStore";
import { useAgentIconUri } from "./hooks/useAgentIconUri";
import { useCreateCloudWorkspace } from "./hooks/useCreateCloudWorkspace";
import { useNewChatTargets } from "./hooks/useNewChatTargets";
import { useNewSessionPreferencesStore } from "./stores/newSessionPreferencesStore";

/** The built-in preset a cloud workspace launches, in the shape a host config has. */
function cloudAgentConfig(agentId: string | null) {
	// A preset picked for a laptop may not exist in the sandbox image.
	const wanted = agentId && isCloudAgentId(agentId) ? agentId : "claude";
	const preset = getPresetById(wanted);
	return preset
		? {
				presetId: preset.presetId,
				label: preset.label,
				iconId: preset.presetId,
			}
		: undefined;
}

export function NewChatWidget({
	workspaces,
}: {
	workspaces: HostWorkspaceItem[];
}) {
	const { t } = useLingui();
	const router = useRouter();
	const composerRef = useRef<ComposerHandle>(null);

	// Whether the composer was open when a sheet took first responder, so it is
	// restored only when it actually was.
	const wasExpanded = useRef(false);
	const draft = useComposerDraft(HOME_DRAFT_KEY);
	const openAttachmentsSheet = useAttachmentsSheet(HOME_DRAFT_KEY);
	const addPasted = usePasteAttachments(HOME_DRAFT_KEY);

	// What was typed here last time, pinned at mount: a starting value handed to
	// the composer as it is set up, never a binding.
	const [initialDraft] = useState(() => draft.readText());

	const agentId = useNewSessionPreferencesStore((state) => state.agentId);
	const targetKey = useNewSessionPreferencesStore((state) => state.targetKey);
	const baseBranch = useNewSessionPreferencesStore((state) => state.baseBranch);
	const setBaseBranch = useNewSessionPreferencesStore(
		(state) => state.setBaseBranch,
	);

	const { targets, defaultTarget } = useNewChatTargets(workspaces);
	const selectedTarget =
		targets.find((target) => target.key === targetKey) ?? defaultTarget;
	const isCloudTarget = selectedTarget?.kind === "cloud";
	const cloudScope = useWorkspaceScope() === "cloud";
	const environmentId = useNewSessionPreferencesStore(
		(state) => state.environmentId,
	);
	const environmentsQuery = useCloudEnvironments();
	const environments = environmentsQuery.data ?? [];
	const selectedEnvironment =
		environments.find((row) => row.id === environmentId) ?? environments[0];

	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const { data: branchData } = useQuery({
		queryKey: [
			isCloudTarget ? "cloud-branches" : "host-service",
			"branches",
			selectedTarget?.hostUrl ?? null,
			selectedTarget?.projectId ?? null,
			"",
		],
		enabled: selectedTarget !== null && (!isCloudTarget || !!organizationId),
		networkMode: "always" as const,
		queryFn: async () => {
			if (!selectedTarget) return null;
			if (selectedTarget.kind === "cloud") {
				if (!organizationId) return null;
				return apiClient.cloudWorkspace.listBranches.query({
					organizationId,
				});
			}
			return getHostServiceClientByUrl(
				selectedTarget.hostUrl,
			).workspaceCreation.searchBranches.query({
				projectId: selectedTarget.projectId,
				limit: 50,
				refresh: true,
			});
		},
	});

	const createTerminalWorkspace = useCreateTerminalWorkspace();
	const createCloudWorkspace = useCreateCloudWorkspace();
	const { data: agentConfigs } = useHostAgentConfigs({
		machineId: selectedTarget?.machineId ?? null,
		hostUrl: selectedTarget?.hostUrl ?? null,
		// A cloud target has no host to list agents from; it offers the
		// built-in presets instead (SUPER-2127 for custom ones).
		enabled: !isCloudTarget,
	});
	const selectedAgent = isCloudTarget
		? cloudAgentConfig(agentId)
		: agentConfigs?.find((config) => config.presetId === agentId);
	// A preset picked for a laptop may not exist in the sandbox; under Cloud
	// the effective agent is the one that will actually launch.
	const effectiveAgentId = isCloudTarget
		? (selectedAgent?.presetId ?? "claude")
		: agentId;
	const agentIconUri = useAgentIconUri(selectedAgent?.iconId ?? agentId);
	// Null until the branch list resolves. The previous fallback was the literal
	// string "default", which reads as a branch name and is not one.
	const branchLabel = baseBranch ?? branchData?.defaultBranch ?? null;

	// Only a request made after mount counts: the store keeps the last nonce,
	// and a remount that read it as "positive" would focus without anyone
	// asking.
	const focusNonce = useComposerFocusStore((state) => state.focusNonce);
	const seenFocusNonce = useRef(focusNonce);
	useEffect(() => {
		if (focusNonce === seenFocusNonce.current) return;
		seenFocusNonce.current = focusNonce;
		composerRef.current?.focus();
	}, [focusNonce]);

	const isSending =
		createTerminalWorkspace.isPending || createCloudWorkspace.isPending;

	// The draft and the tray are cleared together, on success only. The native
	// composer's `clear()` reaches its own text and nothing else — the tray is
	// React Native's — and the old React Native form used to clear both, so
	// splitting them silently left attachments behind after every send.
	const clearComposer = () => {
		composerRef.current?.clear();
		draft.clear();
	};

	const submit = (message: PromptInputMessage) => {
		posthog.capture("chat_message_sent", {
			has_attachments: message.attachments.length > 0,
			attachment_count: message.attachments.length,
			message_length: message.text.trim().length,
			draft_restored: initialDraft.length > 0,
			agent: effectiveAgentId,
			destination: isCloudTarget ? "new_cloud_workspace" : "new_workspace",
		});
		if (!selectedTarget) {
			Alert.alert(
				t({
					message: "No project available",
				}),
			);
			return;
		}
		if (selectedTarget.kind === "cloud") {
			createCloudWorkspace
				.mutateAsync({
					branch: baseBranch ?? branchData?.defaultBranch ?? null,
					environmentId: selectedEnvironment?.id ?? null,
					agent: effectiveAgentId,
					message,
				})
				.then(() => {
					setBaseBranch(null);
					clearComposer();
				})
				.catch(() => {});
			return;
		}
		createTerminalWorkspace
			.mutateAsync({
				target: selectedTarget,
				baseBranch,
				branchLabel,
				agentId,
				agentLabel: selectedAgent?.label ?? "Claude",
				message,
			})
			.then(() => {
				setBaseBranch(null);
				clearComposer();
			})
			.catch(() => {});
	};

	// Under Cloud there is no project to show: a sandbox has no real project
	// structure yet, so the chip is the place itself and the repo it clones is
	// resolved without asking.
	const headerChips = [
		cloudScope
			? {
					id: "project",
					label: t({ message: "Cloud" }),
				}
			: {
					id: "project",
					label: selectedTarget?.projectName ?? t({ message: "No project" }),
					avatar: true,
					iconUri: selectedTarget?.projectIconUrl ?? undefined,
				},
		...(cloudScope
			? [
					{
						id: "environment",
						label:
							selectedEnvironment?.name ??
							t({
								message: "Environment",
							}),
					},
				]
			: []),
		...(branchLabel ? [{ id: "branch", label: branchLabel, muted: true }] : []),
	];

	const selectedModel = {
		id: effectiveAgentId ?? "claude",
		label: selectedAgent?.label ?? "Claude",
		iconUri: agentIconUri ?? undefined,
	};

	// No KeyboardAvoidingView, no absolute-fill backdrop, no safe-area padding:
	// the native composer owns its own keyboard tracking, dimming and dismissal.
	return (
		<Composer
			ref={composerRef}
			placeholder={t({
				message: "Plan, ask, build...",
			})}
			initialDraft={initialDraft}
			isSending={isSending}
			onDictationError={(message: string) => Alert.alert(message)}
			attachments={draft.attachments.map((item) => ({
				id: item.id,
				uri: item.uri ?? "",
				kind: item.type === "image" ? ("image" as const) : ("file" as const),
				name: item.name,
			}))}
			headerChips={headerChips}
			selectedModel={selectedModel}
			onSubmit={(text) => submit({ text, attachments: draft.attachments })}
			onDraftChange={draft.setText}
			onRemoveAttachment={(id) => draft.remove(id)}
			onExpandedChange={(expanded) => {
				if (expanded && !wasExpanded.current) {
					posthog.capture("new_session_started", {
						target_kind: selectedTarget?.kind ?? null,
						agent: effectiveAgentId,
					});
				}
				wasExpanded.current = expanded;
			}}
			onPaste={addPasted}
			onAttachmentsPress={() => {
				void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				const restore = wasExpanded.current;
				openAttachmentsSheet({
					onClosed: () => {
						if (restore) composerRef.current?.focus();
					},
				});
			}}
			onModelPress={() => {
				void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				router.push({
					pathname: "/(authenticated)/(home)/new-session/agent",
					params: { machineId: selectedTarget?.machineId ?? "" },
				});
			}}
			onChipPress={(id) => {
				if (id === "project" && cloudScope) return;
				void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				if (id === "environment") {
					router.push("/(authenticated)/(home)/new-session/environment");
				} else if (id === "project") {
					if (targets.length > 0) {
						router.push({
							pathname: "/(authenticated)/(home)/new-session/project",
							params: { selectedKey: selectedTarget?.key ?? "" },
						});
					}
				} else if (selectedTarget) {
					router.push({
						pathname: "/(authenticated)/(home)/new-session/branch",
						params: {
							projectId: selectedTarget.projectId,
							machineId: selectedTarget.machineId,
						},
					});
				}
			}}
		/>
	);
}
