import { useLingui } from "@lingui/react/macro";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import * as Haptics from "expo-haptics";
import { Mic, MicOff, X } from "lucide-react-native";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { VoiceStatus } from "@/lib/voice/voiceStore";
import { VoiceOrb } from "../VoiceOrb";
import { useVoiceStatusLabel } from "../VoiceStatusLabel";

const ORB_SIZE = 40;

/**
 * The session's bar: it takes the composer's place at the bottom of the
 * screen with the orb, what it is doing, what it is looking at, mute and end.
 */
export function VoiceDock({
	status,
	muted,
	focusLabel,
	onExpand,
	onToggleMute,
	onEnd,
}: {
	status: VoiceStatus;
	muted: boolean;
	focusLabel: string | null;
	onExpand: () => void;
	onToggleMute: () => void;
	onEnd: () => void;
}) {
	const { t } = useLingui();
	const insets = useSafeAreaInsets();
	const statusLabel = useVoiceStatusLabel(status, muted);

	const body = (
		<View className="flex-row items-center gap-3 py-2 pl-2.5 pr-2">
			<VoiceOrb status={status} size={ORB_SIZE} />
			<View className="flex-1">
				<Text className="text-[15px] font-semibold">{statusLabel}</Text>
				{focusLabel ? (
					<Text className="text-muted-foreground text-[13px]" numberOfLines={1}>
						{focusLabel}
					</Text>
				) : null}
			</View>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={
					muted ? t({ message: "Unmute" }) : t({ message: "Mute" })
				}
				hitSlop={6}
				className={cn(
					"size-10 items-center justify-center rounded-full active:opacity-60",
					muted ? "bg-primary" : "bg-secondary",
				)}
				onPress={() => {
					void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
					onToggleMute();
				}}
			>
				<Icon
					as={muted ? MicOff : Mic}
					className={cn(
						"size-[18px]",
						muted ? "text-primary-foreground" : "text-foreground",
					)}
				/>
			</Pressable>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t({ message: "End voice session" })}
				hitSlop={6}
				className="bg-destructive size-10 items-center justify-center rounded-full active:opacity-80"
				onPress={() => {
					void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
					onEnd();
				}}
			>
				<Icon as={X} className="size-[18px] text-white" />
			</Pressable>
		</View>
	);

	return (
		<Animated.View
			entering={FadeInDown.duration(180)}
			exiting={FadeOutDown.duration(140)}
			pointerEvents="box-none"
			style={{
				position: "absolute",
				bottom: insets.bottom + 8,
				left: 16,
				right: 16,
			}}
		>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t({ message: "Expand voice" })}
				onPress={() => {
					void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
					onExpand();
				}}
			>
				{isLiquidGlassAvailable() ? (
					<GlassView glassEffectStyle="regular" style={{ borderRadius: 999 }}>
						{body}
					</GlassView>
				) : (
					<View className="bg-secondary rounded-full">{body}</View>
				)}
			</Pressable>
		</Animated.View>
	);
}
