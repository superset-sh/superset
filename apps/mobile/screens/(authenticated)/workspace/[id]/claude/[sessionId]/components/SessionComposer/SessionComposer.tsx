import type {
	SessionCatalog,
	SessionPermissionMode,
	SessionScopedState,
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
import { OptionPicker } from "./components/OptionPicker";

const GLASS = isLiquidGlassAvailable();

export function SessionComposer({
	onSend,
	onStop,
	onSetModel,
	onSetPermissionMode,
	status,
	isSending,
	disabled,
	state,
	catalog,
}: {
	onSend: (text: string) => Promise<void>;
	onStop: () => void;
	onSetModel: (model: string) => void;
	onSetPermissionMode: (mode: SessionPermissionMode) => void;
	status: "ready" | "streaming";
	isSending: boolean;
	disabled: boolean;
	state: SessionScopedState | null;
	catalog: SessionCatalog | null;
}) {
	const insets = useSafeAreaInsets();
	const keyboardShown = useKeyboardShown();

	const handleSubmit = async (message: PromptInputMessage) => {
		const text = message.text.trim();
		if (!text) return;
		// PromptInput retains the draft until the admission RPC resolves, and it
		// preserves the text entirely when admission fails.
		await onSend(text);
		Keyboard.dismiss();
	};

	const surface = (
		<PromptInput
			className={GLASS ? "border-0 bg-transparent" : undefined}
			onSubmit={handleSubmit}
		>
			<PromptInputBody>
				<PromptInputTextarea
					accessibilityLabel="Message Claude"
					placeholder={disabled ? "Session unavailable" : "Message Claude…"}
					testID="claude-session-composer-input"
				/>
			</PromptInputBody>
			<PromptInputFooter>
				<PromptInputTools>
					{catalog?.models.length ? (
						<OptionPicker
							accessibilityLabel="Select Claude model"
							activeId={state?.model ?? undefined}
							disabled={disabled || isSending}
							onSelect={onSetModel}
							options={catalog.models.map((model) => ({
								id: model.value,
								name: model.displayName,
								description: model.description,
							}))}
							testID="claude-model-picker"
						/>
					) : null}
					{catalog?.permissionModes.length ? (
						<OptionPicker
							accessibilityLabel="Select permission mode"
							activeId={state?.permissionMode}
							disabled={disabled || isSending}
							onSelect={(value) =>
								onSetPermissionMode(value as SessionPermissionMode)
							}
							options={catalog.permissionModes.map((mode) => ({
								id: mode,
								name: permissionModeLabel(mode),
							}))}
							testID="claude-permission-mode-picker"
						/>
					) : null}
				</PromptInputTools>
				<PromptInputSubmit
					disabled={disabled || isSending || undefined}
					onStop={onStop}
					status={status}
					testID="claude-session-composer-submit"
				/>
			</PromptInputFooter>
		</PromptInput>
	);

	return (
		<View
			style={{
				paddingHorizontal: 12,
				paddingBottom: keyboardShown ? 8 : Math.max(insets.bottom, 8),
			}}
		>
			<GlassSurface enabled={GLASS}>{surface}</GlassSurface>
		</View>
	);
}

function permissionModeLabel(mode: SessionPermissionMode): string {
	switch (mode) {
		case "acceptEdits":
			return "Accept edits";
		case "dontAsk":
			return "Don't ask";
		default:
			return mode[0]?.toUpperCase() + mode.slice(1);
	}
}

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
			colorScheme="dark"
			glassEffectStyle="regular"
			isInteractive
			style={{ borderRadius: 16, overflow: "hidden" }}
		>
			{children}
		</GlassView>
	);
}

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
