import { Composer, type ComposerHandle } from "@superset/composer";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import {
	type PromptInputMessage,
	usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import { useSession } from "@/lib/auth/client";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { apiClient } from "@/lib/trpc/client";
import { useAttachmentsSheet } from "@/screens/(authenticated)/hooks/useAttachmentsSheet";
import { useCreateTerminalWorkspace } from "@/screens/(authenticated)/hooks/useCreateTerminalWorkspace";
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
	const attachments = usePromptInputAttachments();
	const openAttachmentsSheet = useAttachmentsSheet();

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
	const { data: agentConfigs } = useQuery({
		queryKey: ["host-agent-configs", selectedTarget?.machineId ?? null],
		// A cloud target has no host to list agents from, and create doesn't
		// launch one (the prompt only feeds the auto-name).
		enabled: selectedTarget !== null && !isCloudTarget,
		staleTime: 60_000,
		networkMode: "always" as const,
		queryFn: async () => {
			if (!selectedTarget) return [];
			return getHostServiceClientByUrl(
				selectedTarget.hostUrl,
			).settings.agentConfigs.list.query();
		},
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

	const dismiss = () => {
		clearChatTarget();
		composerRef.current?.blur();
	};

	const submit = (message: PromptInputMessage) => {
		if (chatTarget) {
			startWorkspaceTerminal
				.mutateAsync({ target: chatTarget, message, agentId })
				.then(() => {
					clearChatTarget();
					composerRef.current?.clear();
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
					composerRef.current?.clear();
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
				composerRef.current?.clear();
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
			isSending={isSending}
			onDictationError={(message: string) => Alert.alert(message)}
			attachments={attachments.attachments.map((item) => ({
				id: item.id,
				uri: item.uri ?? "",
				kind: item.type === "image" ? ("image" as const) : ("file" as const),
				name: item.name,
			}))}
			headerChips={headerChips}
			selectedModel={selectedModel}
			onSubmit={(text) =>
				submit({ text, attachments: attachments.attachments })
			}
			onRemoveAttachment={(id) => attachments.remove(id)}
			onExpandedChange={(expanded) => {
				wasExpanded.current = expanded;
			}}
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
				router.push("/(authenticated)/(home)/new-session/agent");
			}}
			onChipPress={(id) => {
				void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				if (id === "clear-target") {
					dismiss();
				} else if (id === "project") {
					if (targets.length > 0) {
						router.push("/(authenticated)/(home)/new-session/project");
					}
				} else if (selectedTarget) {
					router.push("/(authenticated)/(home)/new-session/branch");
				}
			}}
		/>
	);
}
