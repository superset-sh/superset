import type {
	SessionConfigOption,
	SessionModeState,
} from "@superset/session-protocol";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { type ReactNode, useEffect, useState } from "react";
import { Keyboard, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	PromptInput,
	PromptInputBody,
	PromptInputFooter,
	type PromptInputMessage,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { OptionPicker, type PickerOption } from "./components/OptionPicker";

// iOS 26 Liquid Glass (expo's official module); falls back to the solid card
// surface on older iOS / Android / when Reduce Transparency is on.
const GLASS = isLiquidGlassAvailable();

type SelectConfigOption = Extract<SessionConfigOption, { type: "select" }>;

/** ACP select options come flat or grouped; the chip sheet renders them flat. */
function flattenSelectOptions(
	options: SelectConfigOption["options"],
): PickerOption[] {
	return options.flatMap((entry) =>
		"group" in entry
			? entry.options.map((option) => ({
					id: option.value,
					name: option.name,
					description: option.description,
				}))
			: [
					{
						id: entry.value,
						name: entry.name,
						description: entry.description,
					},
				],
	);
}

/**
 * Fork of the mastra ChatComposer (chat/[sessionId]/components/ChatComposer)
 * for ACP sessions — same glass surface, paddings and footer layout. The
 * footer chips (permission mode, model, effort, ...) are built from what the
 * ACP session itself reports: `modes` and `configOptions` from session/new,
 * kept live via current_mode_update / config_option_update. The submit button
 * doubles as a stop button while a turn is running.
 */
export function Composer({
	onSend,
	onStop,
	onSetMode,
	onSetConfigOption,
	status,
	currentMode,
	configOptions,
}: {
	onSend: (text: string) => void;
	onStop: () => void;
	onSetMode: (modeId: string) => void;
	onSetConfigOption: (configId: string, value: string) => void;
	status: "ready" | "streaming";
	currentMode: SessionModeState | null;
	configOptions: SessionConfigOption[];
}) {
	const insets = useSafeAreaInsets();
	const keyboardShown = useKeyboardShown();

	// The adapter mirrors the permission modes as a `mode` config option (the
	// dedicated mode picker below already covers it) and exposes a Fast-mode
	// toggle as an on/off select (`fast`) — a bare "On"/"Off" chip with no label
	// is meaningless in the composer, so it's hidden until we render toggles.
	const selectOptions = configOptions.filter(
		(option): option is SelectConfigOption =>
			option.type === "select" && option.id !== "mode" && option.id !== "fast",
	);

	// Non-async on purpose: returning a non-Promise makes PromptInput clear the
	// input synchronously on submit (see prompt-input.tsx `submit`). We do not
	// await the send — failures are handled elsewhere, not by blocking the input.
	const handleSubmit = (message: PromptInputMessage) => {
		const text = message.text.trim();
		if (!text) return;
		onSend(text);
	};

	const surface = (
		<PromptInput
			className={GLASS ? "border-0 bg-transparent" : undefined}
			onSubmit={handleSubmit}
		>
			<PromptInputBody>
				<PromptInputTextarea placeholder="Message…" />
			</PromptInputBody>
			<PromptInputFooter>
				<PromptInputTools>
					{currentMode && currentMode.availableModes.length > 0 ? (
						<OptionPicker
							accessibilityLabel="Select permission mode"
							activeId={currentMode.currentModeId}
							onSelect={onSetMode}
							options={currentMode.availableModes.map((mode) => ({
								id: mode.id,
								name: mode.name,
								description: mode.description,
							}))}
						/>
					) : null}
					{selectOptions.map((option) => (
						<OptionPicker
							accessibilityLabel={`Select ${option.name}`}
							activeId={option.currentValue}
							key={option.id}
							onSelect={(value) => onSetConfigOption(option.id, value)}
							options={flattenSelectOptions(option.options)}
						/>
					))}
				</PromptInputTools>
				<PromptInputSubmit onStop={onStop} status={status} />
			</PromptInputFooter>
		</PromptInput>
	);

	return (
		<View
			style={{
				paddingHorizontal: 12,
				// Hug the keyboard when it's up; clear the home indicator when it's down.
				paddingBottom: keyboardShown ? 8 : Math.max(insets.bottom, 8),
			}}
		>
			<GlassSurface enabled={GLASS}>{surface}</GlassSurface>
		</View>
	);
}

/** Wraps the composer in a Liquid Glass container when available. */
function GlassSurface({
	enabled,
	children,
}: {
	enabled: boolean;
	children: ReactNode;
}) {
	if (!enabled) return <>{children}</>;
	return (
		<GlassView
			// Dark-pinned to avoid the glass-material theme-toggle bug (expo #43743);
			// the app is dark-only.
			colorScheme="dark"
			glassEffectStyle="regular"
			isInteractive
			style={{ borderRadius: 16, overflow: "hidden" }}
		>
			{children}
		</GlassView>
	);
}

/** Tracks keyboard visibility using the built-in RN Keyboard module (no extra
 * native dep). iOS gets the `will` events for a frame-synced transition. */
function useKeyboardShown(): boolean {
	const [shown, setShown] = useState(false);
	useEffect(() => {
		const showEvent =
			Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
		const hideEvent =
			Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
		const show = Keyboard.addListener(showEvent, () => setShown(true));
		const hide = Keyboard.addListener(hideEvent, () => setShown(false));
		return () => {
			show.remove();
			hide.remove();
		};
	}, []);
	return shown;
}
