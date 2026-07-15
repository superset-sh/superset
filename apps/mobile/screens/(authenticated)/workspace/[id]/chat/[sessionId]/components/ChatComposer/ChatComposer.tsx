import { useQuery } from "@tanstack/react-query";
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
import { apiClient } from "@/lib/trpc/client";
import { ModelPicker } from "./components/ModelPicker";
import { useSelectedModel } from "./hooks/useSelectedModel";

// iOS 26 Liquid Glass (expo's official module); falls back to the solid card
// surface on older iOS / Android / when Reduce Transparency is on.
const GLASS = isLiquidGlassAvailable();

/**
 * Chat composer built on the shared ai-elements PromptInput kit: a rounded
 * input with a footer toolbar (mode chip + circular submit). Send is
 * fire-and-forget — the text clears the instant you hit send (the sent message
 * shows optimistically), and there is deliberately no send spinner.
 */
export function ChatComposer({
	onSend,
	disabled,
}: {
	onSend: (text: string, model?: string) => void | Promise<void>;
	disabled?: boolean;
}) {
	const insets = useSafeAreaInsets();
	const keyboardShown = useKeyboardShown();

	// Model catalog comes from the CLOUD API (the host relay doesn't expose it);
	// it rarely changes, so keep it fresh for the session.
	const modelsQuery = useQuery({
		queryKey: ["chat", "models"],
		queryFn: () => apiClient.chat.getModels.query(),
		staleTime: Number.POSITIVE_INFINITY,
	});
	const models = modelsQuery.data?.models ?? [];
	const [selectedModelId, selectModel] = useSelectedModel();
	// Mirrors desktop's `activeModel = selectedModel ?? defaultModel`: the user's
	// pick, else the catalog's first entry.
	const activeModelId = selectedModelId ?? models[0]?.id;

	// Non-async on purpose: returning a non-Promise makes PromptInput clear the
	// input synchronously on submit (see prompt-input.tsx `submit`). We do not
	// await the send — failures are handled elsewhere, not by blocking the input.
	const handleSubmit = (message: PromptInputMessage) => {
		const text = message.text.trim();
		if (!text) return;
		// Every send carries the active model, exactly as desktop does: the host
		// only calls `switchModel` when `metadata.model` is present, so sending it
		// on the first message alone would leave every later turn on the old model.
		void onSend(text, activeModelId);
	};

	const surface = (
		<PromptInput
			className={GLASS ? "border-0 bg-transparent" : undefined}
			onSubmit={handleSubmit}
		>
			<PromptInputBody>
				<PromptInputTextarea
					placeholder={disabled ? "Host offline" : "Message…"}
				/>
			</PromptInputBody>
			<PromptInputFooter>
				<PromptInputTools>
					<ModelPicker
						activeId={activeModelId}
						models={models}
						onSelect={selectModel}
					/>
				</PromptInputTools>
				{/* No status → always the arrow icon; empty sends gated by canSubmit. */}
				<PromptInputSubmit disabled={disabled || undefined} />
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
