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
	ZStack,
} from "@expo/ui/swift-ui";
import {
	Animation,
	animation,
	aspectRatio,
	bold,
	buttonBorderShape,
	buttonStyle,
	clipped,
	cornerRadius,
	disabled,
	environment,
	font,
	foregroundStyle,
	frame,
	glassEffect,
	lineLimit,
	opacity,
	padding,
	resizable,
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
import { usePromptInputController } from "@/components/ai-elements/prompt-input";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { useAfterTransitionEnd } from "@/screens/(authenticated)/(home)/hooks/useAfterTransitionEnd";
import { useChatTargetStore } from "../../stores/chatTargetStore";
import { VoiceControl } from "./components/VoiceControl";
import { FOREGROUND, MUTED } from "./constants";
import { useCreateChatWorkspace } from "./hooks/useCreateChatWorkspace";
import { useNewChatTargets } from "./hooks/useNewChatTargets";
import { useStartWorkspaceChat } from "./hooks/useStartWorkspaceChat";
import { useVoiceDictation } from "./hooks/useVoiceDictation";
import { useNewChatPreferencesStore } from "./stores/newChatPreferencesStore";

const PILL_RADIUS = 26;

const EXPAND_SPRING = Animation.spring({ duration: 0.35 });

export function NewChatWidget({
	workspaces,
	resolveHostUrl,
}: {
	workspaces: HostWorkspaceItem[];
	resolveHostUrl: (hostId: string) => string | null;
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
	const attachments = controller.attachments.attachments;
	const hasDraft = hasText || attachments.length > 0;

	const chatTarget = useChatTargetStore((state) => state.target);
	const clearChatTarget = useChatTargetStore((state) => state.clearTarget);
	const startWorkspaceChat = useStartWorkspaceChat(resolveHostUrl);

	// Collapse whenever the keyboard is away — a draft just clamps to one line.
	// A workspace target keeps the composer open so its chip stays visible.
	const expanded = focused || chatTarget !== null;

	useEffect(() => {
		if (chatTarget) void fieldRef.current?.focus();
	}, [chatTarget]);

	// Adding attachments happens in the attachments sheet, which steals focus —
	// re-open the composer once the additions land instead of collapsing to the
	// pill. Waits for the sheet's dismissal to finish so the keyboard doesn't
	// fight the transition.
	const afterTransitionEnd = useAfterTransitionEnd();
	const previousAttachmentCount = useRef(attachments.length);
	useEffect(() => {
		const added = attachments.length > previousAttachmentCount.current;
		previousAttachmentCount.current = attachments.length;
		if (!added) return;
		return afterTransitionEnd(() => void fieldRef.current?.focus());
	}, [attachments.length, afterTransitionEnd]);

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
	const isSending =
		createChatWorkspace.isPending || startWorkspaceChat.isPending;
	const showSend = (hasDraft || isSending) && !voiceActive;

	const dismiss = () => {
		// Reset state directly: if the native field already lost focus (e.g. the
		// system hid the keyboard itself), blur() is a no-op and onFocusChange
		// never fires again — without this the composer wedges open.
		setFocused(false);
		clearChatTarget();
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

	const clearComposer = () => {
		writeDraft("");
		controller.attachments.clear();
		void fieldRef.current?.clear();
	};

	const submit = () => {
		const text = draftRef.current;
		const attachments = controller.attachments.attachments;
		if (text.trim().length === 0 && attachments.length === 0) return;
		if (chatTarget) {
			startWorkspaceChat
				.mutateAsync({ target: chatTarget, message: { text, attachments } })
				.then(() => {
					clearChatTarget();
					clearComposer();
				})
				.catch(() => {});
			return;
		}
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
				clearComposer();
			})
			.catch(() => {});
	};

	// SwiftUI's implicit `.animation(_:value:)` drives every layout change —
	// header/footer reveal, mic→send swap — so the glass morphs natively.
	const animationKey =
		(expanded ? 1 : 0) +
		(showSend ? 2 : 0) +
		(dictation.status === "recording" ? 4 : 0) +
		(dictation.status === "finalizing" ? 8 : 0) +
		(chatTarget ? 16 : 0);

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
				disabled(isSending),
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
								{/* Collapse BOTH dimensions: a width-0 proposal makes Text wrap
							    one glyph per line, leaving a tall invisible column that
							    clipped() hides but layout still counts. */}
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
									<Text modifiers={[foregroundStyle(MUTED)]}>New chat in</Text>
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
										label={selectedTarget?.projectName ?? "No project"}
										onPress={() => {
											void Haptics.impactAsync(
												Haptics.ImpactFeedbackStyle.Light,
											);
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
											void Haptics.impactAsync(
												Haptics.ImpactFeedbackStyle.Light,
											);
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
								</HStack>
								<Spacer />
							</HStack>
							{/* Attachment thumbnails inside the glass, above the field —
						    rendered natively (attachment uris are local files); tapping
						    a thumbnail removes it. */}
							<HStack
								spacing={8}
								modifiers={[
									padding({ horizontal: 16, top: expanded ? 10 : 0 }),
									frame({
										height: expanded && attachments.length > 0 ? undefined : 0,
									}),
									opacity(expanded && attachments.length > 0 ? 1 : 0),
									clipped(),
								]}
							>
								{attachments.map((attachment) => (
									<ZStack key={attachment.id} alignment="topTrailing">
										<Image
											uiImage={attachment.uri}
											modifiers={[
												resizable(),
												aspectRatio({ contentMode: "fill" }),
												frame({ width: 56, height: 56 }),
												cornerRadius(10),
												clipped(),
											]}
										/>
										<Image
											systemName="xmark.circle.fill"
											size={15}
											color="#ffffff"
											onPress={() =>
												controller.attachments.remove(attachment.id)
											}
											modifiers={[padding({ top: 3, trailing: 3 })]}
										/>
									</ZStack>
								))}
								<Spacer />
							</HStack>
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
								{/* Collapsed draft indicator: first attachment as a mini
							    thumbnail, +N badge for the rest. */}
								<HStack
									modifiers={[
										frame({
											width:
												!expanded && attachments.length > 0 ? undefined : 0,
										}),
										opacity(!expanded && attachments.length > 0 ? 1 : 0),
										clipped(),
									]}
								>
									{attachments.length > 0 ? (
										<ZStack>
											<Image
												uiImage={attachments[0]?.uri ?? ""}
												modifiers={[
													resizable(),
													aspectRatio({ contentMode: "fill" }),
													frame({ width: 30, height: 30 }),
													cornerRadius(8),
													clipped(),
												]}
											/>
											{attachments.length > 1 ? (
												<Text
													modifiers={[
														font({ size: 10, weight: "semibold" }),
														foregroundStyle("#ffffff"),
													]}
												>
													+{attachments.length - 1}
												</Text>
											) : null}
										</ZStack>
									) : null}
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
		</View>
	);
}
