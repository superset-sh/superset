import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { CHECK_STYLE, type CheckOutcome } from "../../../../utils/checkOutcome";

/**
 * The running check turns; the ones that have settled hold still.
 *
 * Deliberately React Native's own Animated rather than Reanimated: a worklet
 * would drag Reanimated's Easing and Colors modules into Bundle Mode, which is
 * the fragile path this app already patches metro to keep working, and a
 * constant rotation needs none of it.
 */
export function CheckStatusIcon({ outcome }: { outcome: CheckOutcome }) {
	const style = CHECK_STYLE[outcome];
	const turn = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		if (outcome !== "running") {
			turn.setValue(0);
			return;
		}
		const spin = Animated.loop(
			Animated.timing(turn, {
				toValue: 1,
				duration: 1000,
				easing: Easing.linear,
				useNativeDriver: true,
			}),
		);
		spin.start();
		return () => spin.stop();
	}, [outcome, turn]);

	return (
		<Animated.View
			style={{
				transform: [
					{
						rotate: turn.interpolate({
							inputRange: [0, 1],
							outputRange: ["0deg", "360deg"],
						}),
					},
				],
			}}
		>
			<Icon
				as={style.icon}
				className={cn("size-3.5", style.ink)}
				strokeWidth={3}
			/>
		</Animated.View>
	);
}
