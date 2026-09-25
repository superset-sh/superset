import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import type { CommentIntent } from "@superset/shared/page-comments";
import { SymbolButton } from "@superset/symbol-button";
import * as Haptics from "expo-haptics";
import { View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { APPROVE_BODY, DELETE_BODY, QUICK_PRESETS } from "./constants";

const GLYPH = 20;
const HIT = 30;

interface QuickRepliesProps {
	disabled: boolean;
	onQuick: (body: MessageDescriptor, intent: CommentIntent) => void;
	onPreset: (body: string) => void;
}

export function QuickReplies({
	disabled,
	onQuick,
	onPreset,
}: QuickRepliesProps) {
	const { t } = useLingui();
	const theme = useTheme();
	const tap = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
	const size = { width: HIT, height: HIT };

	return (
		<View className="flex-row items-center gap-4">
			<SymbolButton
				systemImage="trash"
				size={GLYPH}
				tint={theme.mutedForeground}
				enabled={!disabled}
				accessibilityLabel={t({
					message: "Delete this",
					context: "quick reply button",
				})}
				style={size}
				onPress={() => {
					tap();
					onQuick(DELETE_BODY, "delete");
				}}
			/>

			<SymbolButton
				systemImage="hand.thumbsup"
				size={GLYPH}
				tint={theme.mutedForeground}
				enabled={!disabled}
				accessibilityLabel={t({
					message: "Looks good",
					context: "quick reply button",
				})}
				style={size}
				onPress={() => {
					tap();
					onQuick(APPROVE_BODY, "approve");
				}}
			/>

			<SymbolButton
				systemImage="ellipsis"
				size={GLYPH}
				tint={theme.mutedForeground}
				enabled={!disabled}
				accessibilityLabel={t({
					message: "Quick feedback",
					context: "quick reply button",
				})}
				style={size}
				items={QUICK_PRESETS.map((preset) => ({
					id: preset.id,
					title: i18n._(preset.body),
					systemImage: preset.symbol,
				}))}
				onSelect={(id) => {
					const preset = QUICK_PRESETS.find((entry) => entry.id === id);
					if (!preset) return;
					tap();
					onPreset(i18n._(preset.body));
				}}
			/>
		</View>
	);
}
