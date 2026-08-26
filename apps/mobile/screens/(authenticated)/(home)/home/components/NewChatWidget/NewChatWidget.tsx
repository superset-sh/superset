import { Composer, type ComposerHandle } from "@superset/composer";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import { useSession } from "@/lib/auth/client";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { posthog } from "@/lib/posthog";
import { apiClient } from "@/lib/trpc/client";
import { useAttachmentsSheet } from "@/screens/(authenticated)/hooks/useAttachmentsSheet";
import { useComposerDraft } from "@/screens/(authenticated)/hooks/useComposerDraft";
import { useCreateTerminalWorkspace } from "@/screens/(authenticated)/hooks/useCreateTerminalWorkspace";
import { useHostAgentConfigs } from "@/screens/(authenticated)/hooks/useHostAgentConfigs";
import { usePasteAttachments } from "@/screens/(authenticated)/hooks/usePasteAttachments";
import { HOME_DRAFT_KEY } from "@/screens/(authenticated)/stores/composerDraftsStore";
import {
	type ChatTarget,
	useChatTargetStore,
} from "../../stores/chatTargetStore";
import { useAgentIconUri } from "./hooks/useAgentIconUri";
import { useCreateCloudWorkspace } from "./hooks/useCreateCloudWorkspace";
import { useNewChatTargets } from "./hooks/useNewChatTargets";
import { useStartWorkspaceTerminal } from "./hooks/useStartWorkspaceTerminal";
import { useNewSessionPreferencesStore } from "./stores/newSessionPreferencesStore";

export function NewChatWidget({
	workspaces,
	fixedTarget,
	placeholder,
}: {
	workspaces: HostWorkspaceItem[];
	/**
	 * Pins the composer to one workspace: the target/project/branch/model rows
	 * disappear and every submit starts a chat in this workspace.
	 */
	fixedTarget?: ChatTarget;
	placeholder?: string;
}) {
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
					projectId: selectedTarget.projectId,
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
		// A cloud target has no host to list agents from, and create doesn't
		// launch one (the prompt only feeds the auto-name).
		enabled: !isCloudTarget,
	});
	const selectedAgent = agentConfigs?.find(
		(config) => config.presetId === agentId,
	);
	const agentIconUri = useAgentIconUri(selectedAgent?.iconId ?? agentId);
	// Null until the branch list resolves. The previous fallback was the literal
	// string "default", which reads as a branch name and is not one.
	const branchLabel = baseBranch ?? branchData?.defaultBranch ?? null;

	const storeTarget = useChatTargetStore((state) => state.target);
	const clearChatTarget = useChatTargetStore((state) => state.clearTarget);
	const chatTarget = fixedTarget ?? storeTarget;
	const startWorkspaceTerminal = useStartWorkspaceTerminal(workspaces);

	useEffect(() => {
		if (storeTarget) composerRef.current?.focus();
	}, [storeTarget]);

	const isSending =
		createTerminalWorkspace.isPending ||
		createCloudWorkspace.isPending ||
		startWorkspaceTerminal.isPending;

	// The draft and the tray are cleared together, on success only. The native
	// composer's `clear()` reaches its own text and nothing else — the tray is
	// React Native's — and the old React Native form used to clear both, so
	// splitting them silently left attachments behind after every send.
	const clearComposer = () => {
		composerRef.current?.clear();
		draft.clear();
	};

	const dismiss = () => {
		clearChatTarget();
		composerRef.current?.blur();
	};

	const submit = (message: PromptInputMessage) => {
		posthog.capture("chat_message_sent", {
			has_attachments: message.attachments.length > 0,
			attachment_count: message.attachments.length,
			message_length: message.text.trim().length,
			draft_restored: initialDraft.length > 0,
			// A cloud create launches nothing today — the prompt only feeds the
			// server-side auto-name — so there is no agent to name.
			agent: chatTarget || !isCloudTarget ? agentId : null,
			destination: chatTarget
				? "existing_workspace"
				: isCloudTarget
					? "new_cloud_workspace"
					: "new_workspace",
		});
		if (chatTarget) {
			startWorkspaceTerminal
				.mutateAsync({ target: chatTarget, message, agentId })
				.then(() => {
					clearChatTarget();
					clearComposer();
				})
				.catch(() => {});
			return;
		}
		if (!selectedTarget) {
			Alert.alert("No project available");
			return;
		}
		if (selectedTarget.kind === "cloud") {
			createCloudWorkspace
				.mutateAsync({
					target: selectedTarget,
					branch: baseBranch ?? branchData?.defaultBranch ?? null,
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

	// Collapse BOTH dimensions: a width-0 proposal makes Text wrap one glyph
	// per line, leaving a tall invisible column that clipped() hides but layout
	// still counts.
	// Frame 4's header row, as data. A target picked at runtime replaces the
	// project/branch pair, the way the old `header` slot swapped them out —
	// but only a *picked* one. `fixedTarget` pins the composer to a workspace
	// and is not the user's to clear, so it gets no chips at all: the chip's
	// press only clears `storeTarget`, which would leave it stuck on screen.
	const headerChips = fixedTarget
		? []
		: storeTarget
			? [
					{
						id: "clear-target",
						label: `New agent in ${storeTarget.workspaceName}`,
					},
				]
			: [
					{
						id: "project",
						label: selectedTarget
							? isCloudTarget
								? `${selectedTarget.projectName} · Cloud`
								: selectedTarget.projectName
							: "No project",
						avatar: true,
						iconUri: selectedTarget?.projectIconUrl ?? undefined,
					},
					...(branchLabel
						? [{ id: "branch", label: branchLabel, muted: true }]
						: []),
				];

	// No agent chip for a cloud target: nothing launches on create (parity
	// with desktop; the sandbox-side launch is a follow-up).
	const selectedModel =
		fixedTarget || isCloudTarget
			? undefined
			: {
					id: agentId ?? "claude",
					label: selectedAgent?.label ?? "Claude",
					iconUri: agentIconUri ?? undefined,
				};

	// No KeyboardAvoidingView, no absolute-fill backdrop, no safe-area padding:
	// the native composer owns its own keyboard tracking, dimming and dismissal.
	return (
		<Composer
			ref={composerRef}
			placeholder={placeholder ?? "Plan, ask, build..."}
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
				// Only where the project/branch/agent rows are live: pinned to a
				// workspace, expanding the composer starts a message, not a session.
				if (expanded && !wasExpanded.current && !fixedTarget && !storeTarget) {
					posthog.capture("new_session_started", {
						target_kind: selectedTarget?.kind ?? null,
						agent: isCloudTarget ? null : agentId,
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
				void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				if (id === "clear-target") {
					dismiss();
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
