import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import type { CommentIntent } from "@superset/shared/page-comments";
import { SymbolButton } from "@superset/symbol-button";
import * as Haptics from "expo-haptics";
import { View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { APPROVE_BODY, DELETE_BODY, QUICK_PRESETS } from "./constants";

const GLYPH = 12;
const DOTS = 14;
const HIT = 40;

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
	const hit = {
		position: "absolute" as const,
		top: 0,
		left: 0,
		width: HIT,
		height: HIT,
	};

	return (
		<View className="flex-row items-center">
			<View className="size-10 items-center justify-center">
				<View className="bg-foreground/10 size-8 rounded-full" />
				<SymbolButton
					systemImage="trash"
					size={GLYPH}
					tint={theme.mutedForeground}
					enabled={!disabled}
					accessibilityLabel={t({
						message: "Delete this",
						context: "quick reply button",
					})}
					style={hit}
					onPress={() => {
						tap();
						onQuick(DELETE_BODY, "delete");
					}}
				/>
			</View>

			<View className="size-10 items-center justify-center">
				<View className="bg-foreground/10 size-8 rounded-full" />
				<SymbolButton
					systemImage="hand.thumbsup"
					size={GLYPH}
					tint={theme.mutedForeground}
					enabled={!disabled}
					accessibilityLabel={t({
						message: "Looks good",
						context: "quick reply button",
					})}
					style={hit}
					onPress={() => {
						tap();
						onQuick(APPROVE_BODY, "approve");
					}}
				/>
			</View>

			<View className="size-10 items-center justify-center">
				<View className="bg-foreground/10 size-8 rounded-full" />
				<SymbolButton
					systemImage="ellipsis"
					size={DOTS}
					tint={theme.mutedForeground}
					enabled={!disabled}
					accessibilityLabel={t({
						message: "Quick feedback",
						context: "quick reply button",
					})}
					style={hit}
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
		</View>
	);
}
