import { LoaderIcon } from "lucide-react-native";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
	cancelAnimation,
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type LoaderProps = React.ComponentProps<typeof View> & {
	size?: number;
};

export const Loader = ({ className, size = 16, ...props }: LoaderProps) => {
	const rotation = useSharedValue(0);

	useEffect(() => {
		rotation.value = withRepeat(
			withTiming(360, { duration: 1000, easing: Easing.linear }),
			-1,
			false,
		);
		return () => {
			cancelAnimation(rotation);
		};
	}, [rotation]);

	const animatedStyle = useAnimatedStyle(
		() => ({
			transform: [{ rotate: `${rotation.value}deg` }],
		}),
		[rotation],
	);

	return (
		<View
			className={cn("items-center justify-center self-start", className)}
			{...props}
		>
			<Animated.View style={animatedStyle}>
				<Icon
					as={LoaderIcon}
					size={size}
					style={{ height: size, width: size }}
				/>
			</Animated.View>
		</View>
	);
};
