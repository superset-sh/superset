import { StyleSheet, Text } from "react-native";
import { DIFF_FONT_SIZE } from "./diffMetrics";

const PROBE_CHARS = 100;

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
			style={[
				StyleSheet.absoluteFill,
				{ fontSize: DIFF_FONT_SIZE, opacity: 0 },
			]}
		>
			{"0".repeat(PROBE_CHARS)}
		</Text>
	);
}
