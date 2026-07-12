import type { SettingOption } from "@superset/host-service-sync/protocol";
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
import { OptionPicker } from "./components/OptionPicker";

// iOS 26 Liquid Glass (expo's official module); falls back to the solid card
// surface on older iOS / Android / when Reduce Transparency is on.
const GLASS = isLiquidGlassAvailable();

/** The catalogs updateSession can act on; `other` entries (agent personas,
 * fast-mode selects) stay hidden until the update surface covers them. */
const PICKABLE_KINDS = new Set<SettingOption["kind"]>([
	"mode",
	"model",
	"effort",
]);

/**
 * The session composer: glass surface, message field, footer chips.
 * The footer chips (mode, model, effort) are built from the session's
 * harness-reported `settingOptions` catalogs, kept fresh through session
 * upserts. The submit button doubles as a stop button while a turn runs.
 */
export function Composer({
	onSend,
	onStop,
	onSetSetting,
	settingOptions,
	status,
}: {
	onSend: (text: string) => void;
	onStop: () => void;
	onSetSetting: (option: SettingOption, value: string) => void;
	settingOptions: SettingOption[];
	status: "ready" | "streaming";
}) {
	const insets = useSafeAreaInsets();
	const keyboardShown = useKeyboardShown();

	const pickers = settingOptions.filter(
		(option) => PICKABLE_KINDS.has(option.kind) && option.options.length > 0,
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
					{pickers.map((option) => (
						<OptionPicker
							accessibilityLabel={`Select ${option.name}`}
							activeId={option.currentValue ?? undefined}
							key={option.id}
							onSelect={(value) => onSetSetting(option, value)}
							options={option.options.map((choice) => ({
								id: choice.value,
								name: choice.name,
								description: choice.description,
							}))}
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
