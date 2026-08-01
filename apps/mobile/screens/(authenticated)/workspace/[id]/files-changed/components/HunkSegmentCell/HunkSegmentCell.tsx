import { memo, useMemo } from "react";
import { Pressable, Text as RNText, View } from "react-native";
import Animated, {
	type SharedValue,
	useAnimatedStyle,
} from "react-native-reanimated";
import type { HunkSegment, LineRow } from "../../utils/buildListItems";
import {
	DIFF_FONT_SIZE,
	DIFF_LINE_HEIGHT,
	GUTTER_WIDTH,
} from "../../utils/diffMetrics";

const MONO_STYLE = {
	fontSize: DIFF_FONT_SIZE,
	lineHeight: DIFF_LINE_HEIGHT,
};

const SIGN = { add: "+ ", del: "− ", context: "  " } as const;

const PLAIN_COLOR = {
	add: "#4ade80",
	del: "#f87171",
	context: "rgba(232,234,237,0.8)",
} as const;

const SIGN_COLOR = {
	add: "#e8eaed",
	del: "#e8eaed",
	context: "transparent",
} as const;

interface StripeRun {
	type: "add" | "del";
	start: number;
	length: number;
}

function computeRuns(lines: LineRow[]): StripeRun[] {
	const runs: StripeRun[] = [];
	for (let index = 0; index < lines.length; index++) {
		const type = lines[index]?.type;
		if (type !== "add" && type !== "del") continue;
		const last = runs[runs.length - 1];
		if (last && last.type === type && last.start + last.length === index) {
			last.length++;
		} else {
			runs.push({ type, start: index, length: 1 });
		}
	}
	return runs;
}

export const HunkSegmentCell = memo(function HunkSegmentCell({
	segment,
	contentWidth,
	codeViewportWidth,
	scrollX,
	onPressLine,
}: {
	segment: HunkSegment;
	contentWidth: number;
	codeViewportWidth: number;
	scrollX: SharedValue<number>;
	onPressLine: (path: string, line: LineRow) => void;
}) {
	const maxOffset = Math.max(0, contentWidth - codeViewportWidth);
	const panStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: -Math.min(scrollX.value, maxOffset) }],
	}));

	const runs = useMemo(() => computeRuns(segment.lines), [segment.lines]);

	return (
		<Pressable
			style={{ height: segment.height, width: "100%" }}
			onPress={(event) => {
				const index = Math.min(
					segment.lines.length - 1,
					Math.max(
						0,
						Math.floor(event.nativeEvent.locationY / DIFF_LINE_HEIGHT),
					),
				);
				const line = segment.lines[index];
				if (line) onPressLine(segment.path, line);
			}}
		>
			{runs.map((run) => (
				<View
					key={`g:${run.start}`}
					pointerEvents="none"
					style={{
						position: "absolute",
						left: 0,
						width: GUTTER_WIDTH,
						top: run.start * DIFF_LINE_HEIGHT,
						height: run.length * DIFF_LINE_HEIGHT,
						backgroundColor:
							run.type === "add"
								? "rgba(34,197,94,0.25)"
								: "rgba(239,68,68,0.25)",
					}}
				/>
			))}
			{runs.map((run) => (
				<View
					key={`c:${run.start}`}
					pointerEvents="none"
					style={{
						position: "absolute",
						left: GUTTER_WIDTH,
						right: 0,
						top: run.start * DIFF_LINE_HEIGHT,
						height: run.length * DIFF_LINE_HEIGHT,
						backgroundColor:
							run.type === "add"
								? "rgba(34,197,94,0.1)"
								: "rgba(239,68,68,0.1)",
					}}
				/>
			))}
			<View
				pointerEvents="none"
				style={{ position: "absolute", left: 0, top: 0, width: GUTTER_WIDTH }}
			>
				<RNText
					allowFontScaling={false}
					className="font-mono text-right"
					style={[MONO_STYLE, { paddingRight: 6 }]}
				>
					{segment.lines.map((line, index) => (
						<RNText
							allowFontScaling={false}
							key={line.key}
							style={{
								color:
									line.type === "context" ? "rgba(154,163,175,0.6)" : "#e8eaed",
							}}
						>
							{(line.newLineNumber ?? line.oldLineNumber ?? "") +
								(index < segment.lines.length - 1 ? "\n" : "")}
						</RNText>
					))}
				</RNText>
			</View>
			<View
				style={{
					position: "absolute",
					left: GUTTER_WIDTH,
					right: 0,
					top: 0,
					bottom: 0,
					overflow: "hidden",
				}}
			>
				<Animated.View style={panStyle}>
					<RNText
						allowFontScaling={false}
						className="font-mono"
						style={[MONO_STYLE, { width: contentWidth }]}
					>
						{segment.lines.map((line, index) => {
							const newline = index < segment.lines.length - 1 ? "\n" : "";
							if (!line.tokens) {
								return (
									<RNText allowFontScaling={false} key={line.key}>
										<RNText
											allowFontScaling={false}
											style={{ color: SIGN_COLOR[line.type] }}
										>
											{SIGN[line.type]}
										</RNText>
										<RNText
											allowFontScaling={false}
											style={{ color: PLAIN_COLOR[line.type] }}
										>
											{line.text + newline}
										</RNText>
									</RNText>
								);
							}
							return (
								<RNText allowFontScaling={false} key={line.key}>
									<RNText
										allowFontScaling={false}
										style={{ color: SIGN_COLOR[line.type] }}
									>
										{SIGN[line.type]}
									</RNText>
									{line.tokens.map((token, tokenIndex) => (
										<RNText
											allowFontScaling={false}
											// biome-ignore lint/suspicious/noArrayIndexKey: tokens are static per line
											key={tokenIndex}
											style={token.color ? { color: token.color } : undefined}
										>
											{token.content}
										</RNText>
									))}
									{newline}
								</RNText>
							);
						})}
					</RNText>
				</Animated.View>
			</View>
		</Pressable>
	);
});
