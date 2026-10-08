import Animated, {
	type SharedValue,
	useAnimatedStyle,
} from "react-native-reanimated";

export const FRAMES_PER_LOOP = 24;
export const LOOP_MS = FRAMES_PER_LOOP * 50;
const FADE_FRAMES = 3;
const DIAGONAL_DELAY_FRAMES = 2;
const EMPTY_START_FRAME = 11;

export function WaveCell({
	frame,
	diagonal,
	color,
}: {
	frame: SharedValue<number>;
	diagonal: number;
	color: string;
}) {
	const style = useAnimatedStyle(() => {
		const ramp = (frames: number) =>
			Math.min(1, Math.max(0, frames / FADE_FRAMES));
		const step = Math.floor(frame.value);
		const delay = diagonal * DIAGONAL_DELAY_FRAMES;
		return {
			opacity: ramp(step - delay) - ramp(step - EMPTY_START_FRAME - delay),
		};
	});
	return (
		<Animated.View
			style={[
				{ width: 3, height: 3, borderRadius: 0.5, backgroundColor: color },
				style,
			]}
		/>
	);
}
