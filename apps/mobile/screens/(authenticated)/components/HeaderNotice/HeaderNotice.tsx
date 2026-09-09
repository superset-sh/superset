import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { Text } from "@/components/ui/text";

const IN_MS = 180;
const OUT_MS = 160;
const SLIDE = 28;

/** A transient confirmation shown as the header title, in the bar's own glass. */
export function HeaderNotice({
	text,
	visibleFor,
	onHidden,
}: {
	text: string;
	visibleFor: number;
	onHidden: () => void;
}) {
	const progress = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		const animation = Animated.sequence([
			Animated.timing(progress, {
				toValue: 1,
				duration: IN_MS,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: false,
			}),
			Animated.delay(visibleFor),
			Animated.timing(progress, {
				toValue: 0,
				duration: OUT_MS,
				easing: Easing.in(Easing.cubic),
				useNativeDriver: false,
			}),
		]);
		animation.start(({ finished }) => {
			if (finished) onHidden();
		});
		return () => animation.stop();
	}, [progress, visibleFor, onHidden]);

	const style = {
		opacity: progress.interpolate({
			inputRange: [0, 0.3, 1],
			outputRange: [0, 1, 1],
		}),
		transform: [
			{
				translateY: progress.interpolate({
					inputRange: [0, 1],
					outputRange: [-SLIDE, 0],
				}),
			},
		],
	};
	const label = <Text className="font-medium text-[13px]">{text}</Text>;

	return (
		<Animated.View style={style}>
			{isLiquidGlassAvailable() ? (
				<GlassView
					glassEffectStyle="regular"
					style={{
						borderRadius: 999,
						paddingHorizontal: 12,
						paddingVertical: 6,
					}}
				>
					{label}
				</GlassView>
			) : (
				<View className="bg-secondary rounded-full px-3 py-1.5">{label}</View>
			)}
		</Animated.View>
	);
}
