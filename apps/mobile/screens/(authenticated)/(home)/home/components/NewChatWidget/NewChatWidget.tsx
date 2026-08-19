import { Button, HStack, Image, Text } from "@expo/ui/swift-ui";
import {
	aspectRatio,
	bold,
	buttonStyle,
	clipped,
	disabled,
	foregroundStyle,
	frame,
	lineLimit,
	opacity,
	resizable,
	tint,
	truncationMode,
} from "@expo/ui/swift-ui/modifiers";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
	Alert,
	KeyboardAvoidingView,
	Pressable,
	StyleSheet,
	View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import { useSession } from "@/lib/auth/client";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { apiClient } from "@/lib/trpc/client";
import {
	FOREGROUND,
	GlassComposer,
	type GlassComposerHandle,
	MUTED,
} from "@/screens/(authenticated)/components/GlassComposer";
import {
	type ChatTarget,
	useChatTargetStore,
} from "../../stores/chatTargetStore";
import { useAgentIconUri } from "./hooks/useAgentIconUri";
import { useCreateCloudWorkspace } from "./hooks/useCreateCloudWorkspace";
import { useCreateTerminalWorkspace } from "./hooks/useCreateTerminalWorkspace";
import { useNewChatTargets } from "./hooks/useNewChatTargets";
import { useStartWorkspaceTerminal } from "./hooks/useStartWorkspaceTerminal";
import { useNewSessionPreferencesStore } from "./stores/newSessionPreferencesStore";

export function NewChatWidget({
	workspaces,
	fixedTarget,
	placeholder,
	above,
}: {
	workspaces: HostWorkspaceItem[];
	/**
	 * Pins the composer to one workspace: the target/project/branch/model rows
	 * disappear and every submit starts a chat in this workspace.
	 */
	fixedTarget?: ChatTarget;
	placeholder?: string;
	/** Rendered above the glass surface in the bottom cluster (action chips). */
	above?: ReactNode;
}) {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const composerRef = useRef<GlassComposerHandle>(null);

	const [active, setActive] = useState(false);

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
	const branchLabel = baseBranch ?? branchData?.defaultBranch ?? "default";

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
			.mutateAsync({ target: selectedTarget, baseBranch, agentId, message })
			.then((result) => {
				if (!result.agents[0]?.ok) return;
				setBaseBranch(null);
				composerRef.current?.clear();
			})
			.catch(() => {});
	};

	// Collapse BOTH dimensions: a width-0 proposal makes Text wrap one glyph
	// per line, leaving a tall invisible column that clipped() hides but layout
	// still counts.
	const header = fixedTarget ? undefined : (
		<>
			<HStack
				spacing={6}
				modifiers={[
					frame({
						width: chatTarget ? undefined : 0,
						height: chatTarget ? undefined : 0,
					}),
					opacity(chatTarget ? 1 : 0),
					clipped(),
				]}
			>
				<Text modifiers={[foregroundStyle(MUTED)]}>New agent in</Text>
				<Text
					modifiers={[
						bold(),
						foregroundStyle(FOREGROUND),
						lineLimit(1),
						truncationMode("tail"),
					]}
				>
					{chatTarget?.workspaceName ?? ""}
				</Text>
				<Button
					onPress={clearChatTarget}
					modifiers={[buttonStyle("borderless"), tint(MUTED)]}
				>
					<Image systemName="xmark.circle.fill" size={14} />
				</Button>
			</HStack>
			<HStack
				spacing={6}
				modifiers={[
					frame({
						width: chatTarget ? 0 : undefined,
						height: chatTarget ? 0 : undefined,
					}),
					opacity(chatTarget ? 0 : 1),
					clipped(),
				]}
			>
				<Button
					label={
						selectedTarget
							? isCloudTarget
								? `${selectedTarget.projectName} · Cloud`
								: selectedTarget.projectName
							: "No project"
					}
					onPress={() => {
						void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						router.push("/(authenticated)/(home)/new-session/project");
					}}
					modifiers={[
						buttonStyle("borderless"),
						tint(FOREGROUND),
						disabled(targets.length === 0),
					]}
				/>
				<Button
					onPress={() => {
						void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						router.push("/(authenticated)/(home)/new-session/branch");
					}}
					modifiers={[
						buttonStyle("borderless"),
						tint(MUTED),
						disabled(!selectedTarget),
					]}
				>
					<HStack spacing={4}>
						<Text>{branchLabel}</Text>
						<Image systemName="chevron.down" size={11} />
					</HStack>
				</Button>
			</HStack>
		</>
	);

	// No agent chip for a cloud target: nothing launches on create (parity
	// with desktop; the sandbox-side launch is a follow-up).
	const agentPicker =
		fixedTarget || isCloudTarget ? undefined : (
			<Button
				onPress={() => {
					void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
					router.push("/(authenticated)/(home)/new-session/agent");
				}}
				modifiers={[buttonStyle("borderless"), tint(FOREGROUND)]}
			>
				<HStack spacing={5}>
					{agentIconUri ? (
						<Image
							uiImage={agentIconUri}
							modifiers={[
								resizable(),
								aspectRatio({ contentMode: "fit" }),
								frame({ width: 15, height: 15 }),
							]}
						/>
					) : null}
					<Text>{selectedAgent?.label ?? "Claude"}</Text>
					<Image systemName="chevron.down" size={11} />
				</HStack>
			</Button>
		);

	return (
		<View
			testID="home-screen"
			pointerEvents="box-none"
			style={StyleSheet.absoluteFill}
		>
			<KeyboardAvoidingView
				behavior="padding"
				pointerEvents="box-none"
				style={{ flex: 1, justifyContent: "flex-end" }}
			>
				{active ? (
					<Animated.View
						entering={FadeIn.duration(200)}
						exiting={FadeOut.duration(150)}
						style={[
							StyleSheet.absoluteFill,
							{ backgroundColor: "rgba(0, 0, 0, 0.45)" },
						]}
					>
						<Pressable
							accessibilityLabel="Dismiss keyboard"
							onPress={dismiss}
							style={StyleSheet.absoluteFill}
						/>
					</Animated.View>
				) : null}
				<View
					className="px-3"
					style={{ paddingBottom: active ? 8 : insets.bottom + 8 }}
				>
					<GlassComposer
						ref={composerRef}
						above={above}
						header={header}
						toolbarLeading={agentPicker}
						isSending={isSending}
						// A picked workspace target holds the composer open so its
						// chip stays visible; a fixed target is ambient and doesn't.
						keepExpanded={storeTarget !== null}
						onActiveChange={setActive}
						onSubmit={submit}
						placeholder={placeholder ?? "Plan, ask, build..."}
					/>
				</View>
			</KeyboardAvoidingView>
		</View>
	);
}
