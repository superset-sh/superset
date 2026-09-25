import { Text } from "react-native";
import { DIFF_FONT_SIZE } from "./diffMetrics";

// Must fit the narrowest iPhone width, or the layout clamps the measurement.
const PROBE_CHARS = 30;

/** Renders one invisible monospace line to measure the real char advance. */
export function CharWidthProbe({
	onMeasure,
}: {
	onMeasure: (charWidth: number) => void;
}) {
	return (
		<Text
			className="font-mono"
			numberOfLines={1}
			onLayout={(event) => {
				const width = event.nativeEvent.layout.width;
				if (width > 0) onMeasure(width / PROBE_CHARS);
			}}
			style={{
				position: "absolute",
				top: 0,
				left: 0,
				opacity: 0,
				fontSize: DIFF_FONT_SIZE,
			}}
		>
			{"0".repeat(PROBE_CHARS)}
		</Text>
	);
}
