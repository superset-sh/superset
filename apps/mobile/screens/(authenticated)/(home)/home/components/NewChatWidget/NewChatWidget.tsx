import {
	Button,
	Host,
	HStack,
	Image,
	RNHostView,
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
	clipped,
	disabled,
	environment,
	frame,
	glassEffect,
	lineLimit,
	opacity,
	padding,
	tint,
	truncationMode,
} from "@expo/ui/swift-ui/modifiers";
import { SUPERSET_CHAT_MODELS } from "@superset/shared/agent-models";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
import { VoiceControl } from "./components/VoiceControl";
import { FOREGROUND, MUTED } from "./constants";
import { useCreateChatWorkspace } from "./hooks/useCreateChatWorkspace";
import { useNewChatTargets } from "./hooks/useNewChatTargets";
import { useVoiceDictation } from "./hooks/useVoiceDictation";
import { useNewChatPreferencesStore } from "./stores/newChatPreferencesStore";

const PILL_RADIUS = 26;

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
	const draftRef = useRef("");
	const [hasText, setHasText] = useState(false);
	const writeDraft = (text: string) => {
		draftRef.current = text;
		setHasText(text.trim().length > 0);
	};
	const hasDraft = hasText || controller.attachments.attachments.length > 0;
	// Collapse whenever the keyboard is away — a draft just clamps to one line.
	const expanded = focused;

	const dictation = useVoiceDictation({
		read: () => draftRef.current,
		write: (text) => {
			writeDraft(text);
			void fieldRef.current
				?.setText(text)
				.then(() => fieldRef.current?.setSelection(text.length, text.length));
		},
	});
	const voiceActive = dictation.status !== "idle";
	const showSend = (hasDraft || createChatWorkspace.isPending) && !voiceActive;

	const dismiss = () => {
		// Reset state directly: if the native field already lost focus (e.g. the
		// system hid the keyboard itself), blur() is a no-op and onFocusChange
		// never fires again — without this the composer wedges open.
		setFocused(false);
		void fieldRef.current?.blur();
		Keyboard.dismiss();
	};

	// The keyboard can outlive focus (e.g. a sheet pushed over the composer
	// blurs the field without hiding it) — track it separately so the
	// tap-outside backdrop covers that state too.
	const [keyboardShown, setKeyboardShown] = useState(false);
	useEffect(() => {
		const show = Keyboard.addListener("keyboardWillShow", () =>
			setKeyboardShown(true),
		);
		const hide = Keyboard.addListener("keyboardDidHide", () => {
			setKeyboardShown(false);
			setFocused(false);
		});
		return () => {
			show.remove();
			hide.remove();
		};
	}, []);

	const submit = () => {
		const text = draftRef.current;
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
			.then((result) => {
				if (!result.agents[0]?.ok) return;
				setBaseBranch(null);
				writeDraft("");
				controller.attachments.clear();
				void fieldRef.current?.clear();
			})
			.catch(() => {});
	};

	// SwiftUI's implicit `.animation(_:value:)` drives every layout change —
	// header/footer reveal, mic→send swap — so the glass morphs natively.
	const animationKey =
		(expanded ? 1 : 0) +
		(showSend ? 2 : 0) +
		(dictation.status === "recording" ? 4 : 0) +
		(dictation.status === "finalizing" ? 8 : 0);

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

	const voiceControl = <VoiceControl dictation={dictation} />;

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
			{focused || keyboardShown ? (
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
						{/* Every row stays mounted and collapses via frame/opacity —
						    unmounting siblings shifts the TextField's position in the
						    native children array, which recreates the SwiftUI field and
						    kicks out the keyboard the moment the expand settles. */}
						<HStack
							spacing={6}
							modifiers={[
								padding({ horizontal: 16, top: expanded ? 12 : 0 }),
								frame({ height: expanded ? undefined : 0 }),
								opacity(expanded ? 1 : 0),
								clipped(),
							]}
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
						{/* Attachment thumbnails live inside the glass, above the field
						    (RN content bridged into SwiftUI; the host view stays mounted
						    so the TextField's sibling identity is stable). */}
						<RNHostView matchContents>
							<View>
								{expanded ? (
									<PromptInputAttachments className="px-4 pt-2" />
								) : null}
							</View>
						</RNHostView>
						<HStack spacing={6} modifiers={[padding({ all: 6 })]}>
							<HStack
								modifiers={[
									frame({ width: expanded ? 0 : undefined }),
									opacity(expanded ? 0 : 1),
									clipped(),
								]}
							>
								{plusButton}
							</HStack>
							<TextField
								ref={fieldRef}
								axis="vertical"
								placeholder="Plan, ask, build..."
								onTextChange={writeDraft}
								onFocusChange={setFocused}
								modifiers={[
									padding({ horizontal: expanded ? 12 : 4 }),
									frame({ minHeight: expanded ? 56 : 38 }),
									lineLimit(expanded ? 12 : 1),
									truncationMode("tail"),
								]}
							/>
							<HStack
								spacing={0}
								modifiers={[
									frame({ width: expanded ? 0 : undefined }),
									opacity(expanded ? 0 : 1),
									clipped(),
								]}
							>
								{voiceControl}
								{showSend ? sendButton : null}
							</HStack>
						</HStack>
						<HStack
							spacing={10}
							modifiers={[
								padding({ horizontal: 6, bottom: expanded ? 6 : 0 }),
								frame({ height: expanded ? undefined : 0 }),
								opacity(expanded ? 1 : 0),
								clipped(),
							]}
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
								{voiceControl}
								{showSend ? sendButton : null}
							</HStack>
						</HStack>
					</VStack>
				</Host>
			</View>
		</KeyboardAvoidingView>
	);
}
