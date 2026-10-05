import { useEffect } from "react";
import { View } from "react-native";
import {
	Easing,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { FRAMES_PER_LOOP, LOOP_MS, WaveCell } from "./components/WaveCell";

const CELLS = Array.from({ length: 9 }, (_, index) => ({
	id: index,
	diagonal: Math.floor(index / 3) + (index % 3),
}));

export function WaveSpinner({ color }: { color: string }) {
	const frame = useSharedValue(0);
	useEffect(() => {
		frame.value = withRepeat(
			withTiming(FRAMES_PER_LOOP, { duration: LOOP_MS, easing: Easing.linear }),
			-1,
			false,
		);
	}, [frame]);

	return (
		<View
			className="flex-row flex-wrap"
			style={{ width: 11, height: 11, gap: 1 }}
		>
			{CELLS.map((cell) => (
				<WaveCell
					key={cell.id}
					frame={frame}
					diagonal={cell.diagonal}
					color={color}
				/>
			))}
		</View>
	);
}
