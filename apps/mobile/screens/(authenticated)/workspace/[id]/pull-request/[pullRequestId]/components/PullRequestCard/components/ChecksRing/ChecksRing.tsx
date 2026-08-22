import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "@/hooks/useTheme";
import type { ChecksTally } from "../../../../../../utils/pullRequest";

const STROKE = 3.5;

/**
 * Passed, running and failed as arcs of one ring — the glyph the checks sheet
 * also uses for its "All Checks" tab, so the two read as the same object.
 */
export function ChecksRing({
	tally,
	size = 26,
}: {
	tally: ChecksTally;
	size?: number;
}) {
	const theme = useTheme();
	const radius = (size - STROKE) / 2;
	const circumference = 2 * Math.PI * radius;
	const total = Math.max(tally.total, 1);
	// Clockwise from noon in order of how settled each outcome is, so the ring
	// fills with green as checks finish and whatever is still running is always
	// the last arc before noon again. Skipped runs count toward the total, so
	// without an arc of their own they would read as an unexplained gap.
	const segments = [
		{ key: "passed", value: tally.passed, color: "#3fb950" },
		{
			key: "failed",
			value: tally.failed + tally.needsAction,
			color: "#f85149",
		},
		{ key: "ignored", value: tally.ignored, color: "#6e7681" },
		{ key: "running", value: tally.running, color: "#d29922" },
	].filter((segment) => segment.value > 0);

	let consumed = 0;
	return (
		<View style={{ width: size, height: size }}>
			<Svg width={size} height={size}>
				<Circle
					cx={size / 2}
					cy={size / 2}
					fill="none"
					r={radius}
					stroke={theme.border}
					strokeWidth={STROKE}
				/>
				{segments.map((segment) => {
					const length = (segment.value / total) * circumference;
					const rotation = (consumed / total) * 360 - 90;
					consumed += segment.value;
					return (
						<Circle
							cx={size / 2}
							cy={size / 2}
							fill="none"
							key={segment.key}
							originX={size / 2}
							originY={size / 2}
							r={radius}
							rotation={rotation}
							stroke={segment.color}
							strokeDasharray={`${length} ${circumference - length}`}
							strokeWidth={STROKE}
						/>
					);
				})}
			</Svg>
		</View>
	);
}
