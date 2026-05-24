import {
	BottomSheetModalProvider,
	BottomSheetTextInput,
	BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useEffect, useRef, useState } from "react";
import { ScrollView, useColorScheme, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheet, type BottomSheetRef } from "@/components/BottomSheet";
import { SuggestedAnswerPill } from "@/components/SuggestedAnswerPill";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { ChatView } from "../../components/ChatView";
import {
	MOCK_ASK_USER_PILLS,
	MOCK_ASK_USER_QUESTION,
	MOCK_COMPOSER_SETTINGS,
	MOCK_HEADER,
	MOCK_THREAD_STREAMING,
} from "../../mock-data";

export type AskUserSheetProps = {
	className?: string;
	question?: string;
	suggestions?: ReadonlyArray<string>;
	onSubmit?: (answer: string) => void;
	/** Set true to keep the sheet open by default in storybook. */
	autoPresent?: boolean;
};

/**
 * UC-PAUSE-02 §A — ask_user bottom sheet over a dimmed chat view. The sheet
 * contains:
 *  - question (prominent type)
 *  - horizontal-scroll suggested-answer pills (tap to prefill)
 *  - BottomSheetTextInput for freeform answers (keyboard-aware)
 *  - Submit / Cancel buttons
 *
 * Composes @gorhom/bottom-sheet's BottomSheetTextInput so keyboard avoidance
 * is native; gestures + provider are wired in this file (storybook needs the
 * GestureHandlerRootView + BottomSheetModalProvider harness inline).
 */
export function AskUserSheet({
	className,
	question = MOCK_ASK_USER_QUESTION,
	suggestions = MOCK_ASK_USER_PILLS,
	onSubmit,
	autoPresent = true,
}: AskUserSheetProps) {
	const sheetRef = useRef<BottomSheetRef>(null);
	const [answer, setAnswer] = useState("");
	const colorScheme = useColorScheme();
	// gorhom no-className: BottomSheetTextInput requires inline styles.
	// Mirror global.css hex values here and avoid the theme.ts prep-crash path,
	// following the ScrollFade.tsx precedent.
	const inputBg = colorScheme === "dark" ? "#201e1c" : "#ffffff";
	const inputText = colorScheme === "dark" ? "#f3eee9" : "#252525";
	const inputPlaceholder = colorScheme === "dark" ? "#ada6a3" : "#808080";

	useEffect(() => {
		if (autoPresent) {
			sheetRef.current?.present();
		}
	}, [autoPresent]);

	const handleSubmit = () => {
		onSubmit?.(answer);
		sheetRef.current?.dismiss();
	};

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<BottomSheetModalProvider>
				<ChatView
					className={className}
					header={{
						...MOCK_HEADER,
						status: "paused",
						statusLabel: "Awaiting answer",
					}}
					items={MOCK_THREAD_STREAMING}
					composer={{
						state: "disabled",
						rowProps: {
							settings: MOCK_COMPOSER_SETTINGS,
							onCommandsPress: () => {},
						},
					}}
				/>
				<BottomSheet ref={sheetRef} snapPoints={["55%", "85%"]}>
					<BottomSheetView style={{ padding: 20, gap: 16 }}>
						<Text className="text-foreground text-lg font-semibold">
							{question}
						</Text>
						<ScrollView
							horizontal
							showsHorizontalScrollIndicator={false}
							contentContainerStyle={{ gap: 8 }}
						>
							{suggestions.map((s, i) => (
								<SuggestedAnswerPill
									key={s}
									text={s}
									variant={i === 0 ? "accent" : "default"}
									onPress={() => setAnswer(s)}
								/>
							))}
						</ScrollView>
						{/*
						 * BottomSheetTextInput is the @gorhom/bottom-sheet vendor primitive
						 * that owns keyboard avoidance — it accepts inline `style` only, not
						 * `className`. The colorScheme hex values above mirror the light/dark
						 * tokens in `apps/mobile/global.css` exactly:
						 *   --color-card             → #ffffff / #201e1c
						 *   --color-foreground       → #252525 / #f3eee9
						 *   --color-muted-foreground → #808080 / #ada6a3
						 * We cannot import THEME from `apps/mobile/lib/theme.ts` here because
						 * that module transitively imports expo-router/react-navigation,
						 * which crashes storybook RN prep (UnhandledLinkingContext). Same
						 * precedent as ScrollFade.tsx.
						 */}
						<BottomSheetTextInput
							value={answer}
							onChangeText={setAnswer}
							placeholder="Type your answer…"
							multiline
							style={{
								minHeight: 96,
								padding: 12,
								borderRadius: 8,
								backgroundColor: inputBg,
								color: inputText,
								fontSize: 15,
							}}
							placeholderTextColor={inputPlaceholder}
						/>
						<View className="flex-row gap-2">
							<Button
								variant="outline"
								className="flex-1"
								onPress={() => sheetRef.current?.dismiss()}
							>
								<Text>Cancel</Text>
							</Button>
							<Button
								className="flex-1"
								disabled={answer.length === 0}
								onPress={handleSubmit}
							>
								<Text>Send</Text>
							</Button>
						</View>
					</BottomSheetView>
				</BottomSheet>
			</BottomSheetModalProvider>
		</GestureHandlerRootView>
	);
}
