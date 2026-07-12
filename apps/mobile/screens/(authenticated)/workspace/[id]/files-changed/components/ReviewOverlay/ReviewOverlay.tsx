import { ListOrdered } from "lucide-react-native";
import { View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";

export function ReviewOverlay({
	draftCount,
	onFinishReview,
	onJumpToFile,
}: {
	draftCount: number;
	onFinishReview: () => void;
	onJumpToFile: () => void;
}) {
	const insets = useSafeAreaInsets();
	return (
		<View
			className="absolute right-0 left-0 items-center"
			pointerEvents="box-none"
			style={{ bottom: Math.max(insets.bottom, 12) + 4 }}
		>
			{draftCount > 0 ? (
				<Animated.View
					entering={FadeIn.duration(150)}
					exiting={FadeOut.duration(120)}
				>
					<PressableScale
						className="bg-card border-border flex-row items-center gap-2 rounded-full border px-4 py-2.5 shadow-lg"
						onPress={onFinishReview}
					>
						<Text className="font-semibold text-[13.5px]">Finish review</Text>
						<View className="bg-foreground rounded-full px-1.5 py-0.5">
							<Text className="text-background text-[10.5px] font-bold">
								{draftCount}
							</Text>
						</View>
					</PressableScale>
				</Animated.View>
			) : null}
			<PressableScale
				accessibilityLabel="Jump to file"
				className="bg-card border-border absolute right-3 size-10 items-center justify-center rounded-full border shadow-lg"
				style={{ bottom: 0 }}
				onPress={onJumpToFile}
			>
				<Icon as={ListOrdered} className="text-foreground size-4.5" />
			</PressableScale>
		</View>
	);
}
