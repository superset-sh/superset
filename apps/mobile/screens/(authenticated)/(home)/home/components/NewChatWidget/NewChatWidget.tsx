import {
	Button,
	Host,
	HStack,
	Image,
	Spacer,
	Text,
	TextField,
	type TextFieldRef,
	VStack,
} from "@expo/ui/swift-ui";
import {
	Animation,
	animation,
	buttonBorderShape,
	buttonStyle,
	disabled,
	environment,
	frame,
	glassEffect,
	lineLimit,
	padding,
	tint,
} from "@expo/ui/swift-ui/modifiers";
import { SUPERSET_CHAT_MODELS } from "@superset/shared/agent-models";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
	Alert,
	Keyboard,
	KeyboardAvoidingView,
	Pressable,
	StyleSheet,
	View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	PromptInputAttachments,
	usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { useCreateChatWorkspace } from "./hooks/useCreateChatWorkspace";
import { useNewChatTargets } from "./hooks/useNewChatTargets";
import { useVoiceDictation } from "./hooks/useVoiceDictation";
import { useNewChatPreferencesStore } from "./stores/newChatPreferencesStore";

const PILL_RADIUS = 26;

const FOREGROUND = "#e5e5e5";
const MUTED = "#8e8e93";

const EXPAND_SPRING = Animation.spring({ duration: 0.35 });

export function NewChatWidget({
	workspaces,
}: {
	workspaces: HostWorkspaceItem[];
}) {
	return (
		<View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
			<NewChatWidgetInner workspaces={workspaces} />
		</View>
	);
}

function NewChatWidgetInner({
	workspaces,
}: {
	workspaces: HostWorkspaceItem[];
}) {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const controller = usePromptInputController();
	const fieldRef = useRef<TextFieldRef>(null);

	const [focused, setFocused] = useState(false);

	const modelId = useNewChatPreferencesStore((state) => state.modelId);
	const targetKey = useNewChatPreferencesStore((state) => state.targetKey);
	const baseBranch = useNewChatPreferencesStore((state) => state.baseBranch);
	const setBaseBranch = useNewChatPreferencesStore(
		(state) => state.setBaseBranch,
	);

	const { targets, defaultTarget } = useNewChatTargets(workspaces);
	const selectedTarget =
		targets.find((target) => target.key === targetKey) ?? defaultTarget;

	const { data: branchData } = useQuery({
		queryKey: [
			"host-service",
			"branches",
			selectedTarget?.hostUrl ?? null,
			selectedTarget?.projectId ?? null,
			"",
		],
		enabled: selectedTarget !== null,
		networkMode: "always" as const,
		queryFn: async () => {
			if (!selectedTarget) return null;
			return getHostServiceClientByUrl(
				selectedTarget.hostUrl,
			).workspaceCreation.searchBranches.query({
				projectId: selectedTarget.projectId,
				limit: 50,
				refresh: true,
			});
		},
	});

	const createChatWorkspace = useCreateChatWorkspace();
	const selectedModel = SUPERSET_CHAT_MODELS.find(
		(model) => model.id === modelId,
	);
	const branchLabel = baseBranch ?? branchData?.defaultBranch ?? "default";
	const hasDraft =
		controller.textInput.value.trim().length > 0 ||
		controller.attachments.attachments.length > 0;
	// Collapse whenever the keyboard is away — a draft just clamps to one line.
	const expanded = focused;
	const showSend = hasDraft || createChatWorkspace.isPending;

	const dictation = useVoiceDictation((text) => {
		controller.textInput.setInput(text);
		void fieldRef.current?.setText(text);
	});

	const dismiss = () => {
		void fieldRef.current?.blur();
		Keyboard.dismiss();
	};

	const submit = () => {
		const text = controller.textInput.value;
		const attachments = controller.attachments.attachments;
		if (text.trim().length === 0 && attachments.length === 0) return;
		if (!selectedTarget) {
			Alert.alert("No project on an online host");
			return;
		}
		createChatWorkspace
			.mutateAsync({
				target: selectedTarget,
				baseBranch,
				modelId,
				message: { text, attachments },
			})
			.then(() => {
				setBaseBranch(null);
				controller.textInput.clear();
				controller.attachments.clear();
				void fieldRef.current?.clear();
			})
			.catch(() => {});
	};

	// SwiftUI's implicit `.animation(_:value:)` drives every layout change —
	// header/footer reveal, mic→send swap — so the glass morphs natively.
	const animationKey =
		(expanded ? 1 : 0) + (showSend ? 2 : 0) + (dictation.recording ? 4 : 0);

	// The + and mic/send sit inline with the field when collapsed and drop to
	// the toolbar row when expanded; only the TextField must never move.
	const plusButton = (
		<Button
			onPress={() => {
				void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				router.push("/(authenticated)/(home)/attachments");
			}}
			modifiers={[
				buttonStyle("bordered"),
				buttonBorderShape("circle"),
				tint(FOREGROUND),
			]}
		>
			<Image
				systemName="plus"
				size={16}
				modifiers={[frame({ width: 26, height: 26 })]}
			/>
		</Button>
	);

	const micButton = (
		<Button
			onPress={
				dictation.recording ? dictation.stop : () => void dictation.start()
			}
			modifiers={[
				buttonStyle("bordered"),
				buttonBorderShape("circle"),
				tint(dictation.recording ? "#ef4444" : FOREGROUND),
			]}
		>
			<Image
				systemName={dictation.recording ? "stop.fill" : "mic"}
				size={16}
				modifiers={[frame({ width: 26, height: 26 })]}
			/>
		</Button>
	);

	// Inserted beside the mic when a draft exists: the animated layout change
	// slides the mic left and the insertion fades the send button in.
	const sendButton = (
		<Button
			onPress={submit}
			modifiers={[
				buttonStyle("borderedProminent"),
				buttonBorderShape("circle"),
				tint("#ffffff"),
				disabled(createChatWorkspace.isPending),
			]}
		>
			<Image
				systemName="arrow.up"
				size={16}
				color="#1c1c1e"
				modifiers={[frame({ width: 26, height: 26 })]}
			/>
		</Button>
	);

	return (
		<KeyboardAvoidingView
			behavior="padding"
			pointerEvents="box-none"
			style={{ flex: 1, justifyContent: "flex-end" }}
		>
			{focused ? (
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
				style={{ paddingBottom: focused ? 8 : insets.bottom + 8 }}
			>
				<PromptInputAttachments className="pb-2" />
				<Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
					<VStack
						spacing={0}
						modifiers={[
							environment("colorScheme", "dark"),
							// SwiftUI stacks hug their content; stretch to the Host width.
							frame({ maxWidth: 100_000 }),
							glassEffect({
								glass: { variant: "regular", interactive: true },
								shape: "roundedRectangle",
								cornerRadius: PILL_RADIUS,
							}),
							animation(EXPAND_SPRING, animationKey),
						]}
					>
						{expanded ? (
							<HStack
								spacing={6}
								modifiers={[padding({ horizontal: 16, top: 12 })]}
							>
								<Button
									label={selectedTarget?.projectName ?? "No project"}
									onPress={() => {
										void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
										router.push("/(authenticated)/(home)/new-chat/project");
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
										router.push("/(authenticated)/(home)/new-chat/branch");
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
								<Spacer />
							</HStack>
						) : null}
						<HStack spacing={6} modifiers={[padding({ all: 6 })]}>
							{expanded ? null : plusButton}
							<TextField
								ref={fieldRef}
								axis="vertical"
								placeholder="Plan, ask, build..."
								onTextChange={controller.textInput.setInput}
								onFocusChange={setFocused}
								modifiers={[
									padding({ horizontal: expanded ? 12 : 4 }),
									frame({ minHeight: expanded ? 56 : 38 }),
									...(expanded ? [] : [lineLimit(1)]),
								]}
							/>
							{expanded ? null : showSend ? sendButton : micButton}
						</HStack>
						{expanded ? (
							<HStack
								spacing={10}
								modifiers={[padding({ horizontal: 6, bottom: 6 })]}
							>
								{plusButton}
								<Button
									onPress={() => {
										void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
										router.push("/(authenticated)/(home)/new-chat/model");
									}}
									modifiers={[buttonStyle("borderless"), tint(FOREGROUND)]}
								>
									<HStack spacing={4}>
										<Text>{selectedModel?.label ?? "Model"}</Text>
										<Image systemName="chevron.down" size={11} />
									</HStack>
								</Button>
								<Spacer />
								{/* Bordered buttons carry ~6pt of invisible tap-target inset
								    around the visible circle, so spacing 0 still reads as a
								    ~12pt visual gap between the circles. */}
								<HStack spacing={0}>
									{micButton}
									{showSend ? sendButton : null}
								</HStack>
							</HStack>
						) : null}
					</VStack>
				</Host>
			</View>
		</KeyboardAvoidingView>
	);
}
