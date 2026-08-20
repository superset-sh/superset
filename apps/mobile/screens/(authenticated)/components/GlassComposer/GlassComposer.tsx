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
	accessibilityLabel,
	animation,
	aspectRatio,
	background,
	buttonBorderShape,
	buttonStyle,
	clipped,
	contentShape,
	cornerRadius,
	disabled,
	environment,
	font,
	foregroundStyle,
	frame,
	glassEffect,
	lineLimit,
	onGeometryChange,
	onTapGesture,
	opacity,
	padding,
	resizable,
	shapes,
	textInputAutocapitalization,
	tint,
	truncationMode,
} from "@expo/ui/swift-ui/modifiers";
import { type PasteImagesEvent, PasteInputView } from "@superset/paste-input";
import * as Haptics from "expo-haptics";
import {
	forwardRef,
	type ReactNode,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { Keyboard, View } from "react-native";
import {
	type PromptInputAttachmentItem,
	type PromptInputMessage,
	usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import { VoiceControl } from "./components/VoiceControl";
import { FOREGROUND, PILL_RADIUS } from "./constants";
import { useAttachmentsSheet } from "./hooks/useAttachmentsSheet";
import { useVoiceDictation } from "./hooks/useVoiceDictation";

const EXPAND_SPRING = Animation.spring({ duration: 0.35 });

/** Gap between the `above` cluster and the glass pill, laid out by SwiftUI. */
const ABOVE_GAP = 10;

/**
 * The liquid-glass material paints a few points beyond its layout frame, so a
 * frame-tight box clips the pill's rounded bottom (under the keyboard, on the
 * terminal). Pad the content by that bleed so the glass stays inside the
 * measured height rather than compensating outside it in RN.
 */
const GLASS_BLEED = 10;

/** Stable identity so `showAttachments={false}` doesn't churn effect deps. */
const NO_ATTACHMENTS: PromptInputAttachmentItem[] = [];

type TextInputAutocapitalization = Parameters<
	typeof textInputAutocapitalization
>[0];

export interface GlassComposerHandle {
	focus: () => void;
	blur: () => void;
	/** Empties the field and the attachment tray. */
	clear: () => void;
}

export interface GlassComposerProps {
	placeholder?: string;
	/** Rendered above the glass surface — action chips, terminal quick keys. */
	above?: ReactNode;
	/**
	 * Row inside the glass above the field, revealed while expanded. Surface
	 * specific (the home composer's target/project/branch chips); pass nothing
	 * and the row collapses to zero height.
	 */
	header?: ReactNode;
	/** Expanded-toolbar controls between the + button and the mic. */
	toolbarLeading?: ReactNode;
	/** Keeps the composer expanded while the field isn't focused. */
	keepExpanded?: boolean;
	/** Overrides the native keyboard's autocapitalization behavior. */
	textInputAutocapitalization?: TextInputAutocapitalization;
	/** A submit is in flight: send stays visible but disabled. */
	isSending?: boolean;
	/**
	 * Offer the attachment tray. False collapses the + button, the thumbnail
	 * row and the collapsed mini-thumb — for surfaces where a file has nowhere
	 * to go (a plain shell just tries to execute the path).
	 */
	showAttachments?: boolean;
	/**
	 * The composer is focused, or the keyboard is up without it (a sheet
	 * pushed over the composer blurs the field without hiding the keyboard) —
	 * the signal callers dim a backdrop and drop their safe-area padding on.
	 */
	onActiveChange?: (active: boolean) => void;
	/**
	 * Never clears the composer — the caller clears through the ref once its
	 * own delivery succeeded, so a failed send keeps the draft.
	 */
	onSubmit: (message: PromptInputMessage) => void;
}

/**
 * The SwiftUI glass pill both composers are built from: draft-ref TextField,
 * attachments, voice dictation, and the mic→send swap, with slots for the
 * surface-specific chrome around them (`header`, `toolbarLeading`, `above`).
 * Positioning and keyboard avoidance belong to the caller — this renders a
 * plain column.
 */
export const GlassComposer = forwardRef<
	GlassComposerHandle,
	GlassComposerProps
>(function GlassComposer(
	{
		placeholder,
		above,
		header,
		toolbarLeading,
		keepExpanded = false,
		textInputAutocapitalization: inputAutocapitalization,
		isSending = false,
		showAttachments = true,
		onActiveChange,
		onSubmit,
	},
	ref,
) {
	const openAttachmentsSheet = useAttachmentsSheet();
	const controller = usePromptInputController();
	const fieldRef = useRef<TextFieldRef>(null);

	const [focused, setFocused] = useState(false);
	// The draft lives in a ref, never state — otherwise each keystroke
	// re-renders the SwiftUI Host.
	const draftRef = useRef("");
	const [hasText, setHasText] = useState(false);

	const writeDraft = (text: string) => {
		draftRef.current = text;
		setHasText(text.trim().length > 0);
	};

	const attachments = showAttachments
		? controller.attachments.attachments
		: NO_ATTACHMENTS;
	const hasDraft = hasText || attachments.length > 0;

	// Collapse whenever the keyboard is away — a draft just clamps to one line.
	const expanded = focused || keepExpanded;
	const showHeaderRow = expanded && header !== undefined;

	// Focusing programmatically does NOT fire the field's onFocusChange, so the
	// state has to be set here too — otherwise the field takes focus while React
	// still thinks it's blurred and the pill stays collapsed under a live
	// keyboard (attachments landed as the mini-thumb instead of the thumb row).
	const focusField = useCallback(() => {
		setFocused(true);
		void fieldRef.current?.focus();
	}, []);

	useImperativeHandle(ref, () => ({
		focus: focusField,
		blur: () => {
			// Reset state directly: if the native field already lost focus (e.g.
			// the system hid the keyboard itself), blur() is a no-op and
			// onFocusChange never fires again — without this the composer wedges
			// open.
			setFocused(false);
			void fieldRef.current?.blur();
			Keyboard.dismiss();
		},
		clear: () => {
			writeDraft("");
			controller.attachments.clear();
			void fieldRef.current?.clear();
		},
	}));

	// The keyboard can outlive focus (e.g. a sheet pushed over the composer
	// blurs the field without hiding it) — track it separately so callers can
	// cover that state too.
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

	// `Host matchContents` under-reports the settled glass, so RN reserves less
	// room than SwiftUI actually draws and the pill's bottom slips under the
	// keyboard once it grows (attachments, extra lines). SwiftUI knows the real
	// frame — have it report back and size the RN box from that instead.
	const [contentHeight, setContentHeight] = useState<number | null>(null);
	const reportHeight = useCallback(({ height }: { height: number }) => {
		setContentHeight((current) =>
			current !== null && Math.abs(current - height) < 0.5 ? current : height,
		);
	}, []);

	const active = focused || keyboardShown;
	useEffect(() => {
		onActiveChange?.(active);
	}, [active, onActiveChange]);

	// Adding attachments happens in the attachments sheet, which blurs the field
	// on the way in — re-open the composer once the additions land instead of
	// leaving it collapsed. This runs after the sheet's keyboardDidHide, so
	// setting focus state here sticks; iOS restores the field's first responder
	// itself on dismissal WITHOUT emitting onFocusChange, which is why the state
	// has to be set rather than waited for.
	const previousAttachmentCount = useRef(attachments.length);
	useEffect(() => {
		const added = attachments.length > previousAttachmentCount.current;
		previousAttachmentCount.current = attachments.length;
		if (added) focusField();
	}, [attachments.length, focusField]);

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
	const showSend = (hasDraft || isSending) && !voiceActive;

	const submit = () => {
		const text = draftRef.current;
		if (text.trim().length === 0 && attachments.length === 0) return;
		onSubmit({ text, attachments });
	};

	const handlePasteImages = (event: PasteImagesEvent) => {
		if (!showAttachments) return;
		controller.attachments.add(
			event.nativeEvent.images.map((image) => ({
				mediaType: "image/jpeg",
				name: image.uri.split("/").pop(),
				type: "image" as const,
				uri: image.uri,
			})),
		);
	};

	// SwiftUI's implicit `.animation(_:value:)` drives every layout change —
	// header/footer reveal, mic→send swap — so the glass morphs natively.
	const animationKey =
		(expanded ? 1 : 0) +
		(showSend ? 2 : 0) +
		(dictation.status === "recording" ? 4 : 0) +
		(dictation.status === "finalizing" ? 8 : 0) +
		(keepExpanded ? 16 : 0) +
		(showAttachments ? 32 : 0);

	// The + and mic/send sit inline with the field when collapsed and drop to
	// the toolbar row when expanded; only the TextField must never move.
	const plusButton = (
		<Button
			onPress={() => {
				void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				openAttachmentsSheet();
			}}
			modifiers={[
				buttonStyle("bordered"),
				buttonBorderShape("circle"),
				tint(FOREGROUND),
				accessibilityLabel("Add attachment"),
			]}
		>
			<Image
				systemName="plus"
				size={16}
				modifiers={[frame({ width: 16, height: 16 })]}
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
				// Distinct from the terminal quick-key row's up arrow, which is
				// otherwise the same `arrow.up` symbol to VoiceOver.
				accessibilityLabel("Send"),
			]}
		>
			<Image
				systemName="arrow.up"
				size={16}
				color="#1c1c1e"
				modifiers={[frame({ width: 16, height: 16 })]}
			/>
		</Button>
	);

	return (
		<View
			style={contentHeight === null ? undefined : { height: contentHeight }}
		>
			<PasteInputView
				enabled={showAttachments}
				onPasteImages={handlePasteImages}
			>
				<Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
					<VStack
						spacing={ABOVE_GAP}
						modifiers={[
							environment("colorScheme", "dark"),
							frame({ maxWidth: 100_000 }),
							padding({ bottom: GLASS_BLEED }),
							// One spring for the whole cluster: `above` sits inside the Host
							// so SwiftUI owns the gap to the pill. As an RN sibling it had to
							// guess a height `Host matchContents` under-reports, and animated
							// on its own curve.
							animation(EXPAND_SPRING, animationKey),
							onGeometryChange(reportHeight),
						]}
					>
						{above ? (
							<HStack spacing={8} modifiers={[padding({ horizontal: 2 })]}>
								{above}
							</HStack>
						) : null}
						<VStack
							spacing={0}
							modifiers={[
								// SwiftUI stacks hug their content; stretch to the Host width.
								frame({ maxWidth: 100_000 }),
								glassEffect({
									glass: { variant: "regular", interactive: true },
									shape: "roundedRectangle",
									cornerRadius: PILL_RADIUS,
								}),
								// Whole-pill hit target: taps on padding/spacers focus the
								// field (buttons and the field itself still win their taps).
								contentShape(shapes.rectangle()),
								onTapGesture(focusField),
							]}
						>
							{/* Every row stays mounted and collapses via frame/opacity —
					    unmounting siblings shifts the TextField's position in the
					    native children array, which recreates the SwiftUI field and
					    kicks out the keyboard the moment the expand settles. */}
							<HStack
								spacing={6}
								modifiers={[
									padding({ horizontal: 16, top: showHeaderRow ? 12 : 0 }),
									frame({ height: showHeaderRow ? undefined : 0 }),
									opacity(showHeaderRow ? 1 : 0),
									clipped(),
								]}
							>
								{header}
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
										{attachment.type === "image" ? (
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
										) : (
											<Image
												systemName="doc.fill"
												size={22}
												color="#ffffff"
												modifiers={[
													frame({ width: 56, height: 56 }),
													background("#ffffff26"),
													cornerRadius(10),
													clipped(),
												]}
											/>
										)}
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
							<HStack
								spacing={6}
								// Tuned on-device: the bordered button style carries intrinsic
								// inset around its visible circle; these values land the
								// circle ~8pt off every pill edge.
								modifiers={[padding({ horizontal: 1, vertical: 4 })]}
							>
								<HStack
									modifiers={[
										frame({
											width: expanded || !showAttachments ? 0 : undefined,
										}),
										opacity(expanded || !showAttachments ? 0 : 1),
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
											{attachments[0]?.type === "image" ? (
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
											) : (
												<Image
													systemName="doc.fill"
													size={13}
													color="#ffffff"
													modifiers={[
														frame({ width: 30, height: 30 }),
														background("#ffffff26"),
														cornerRadius(8),
														clipped(),
													]}
												/>
											)}
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
									placeholder={placeholder ?? "Plan, ask, build..."}
									onTextChange={writeDraft}
									onFocusChange={setFocused}
									modifiers={[
										padding({ horizontal: expanded ? 12 : 4 }),
										frame({ minHeight: expanded ? 56 : 38 }),
										lineLimit(expanded ? 12 : 1),
										truncationMode("tail"),
										...(inputAutocapitalization
											? [textInputAutocapitalization(inputAutocapitalization)]
											: []),
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
									padding({ horizontal: 2, bottom: expanded ? 6 : 0 }),
									frame({ height: expanded ? undefined : 0 }),
									opacity(expanded ? 1 : 0),
									clipped(),
								]}
							>
								<HStack
									modifiers={[
										frame({ width: showAttachments ? undefined : 0 }),
										opacity(showAttachments ? 1 : 0),
										clipped(),
									]}
								>
									{plusButton}
								</HStack>
								{toolbarLeading}
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
					</VStack>
				</Host>
			</PasteInputView>
		</View>
	);
});
