import { getDefaultTerminalColors } from "@superset/shared/theme-colors";
import { memo, useMemo } from "react";
import { Pressable, Text as RNText, View } from "react-native";
import Animated, {
	type SharedValue,
	useAnimatedStyle,
} from "react-native-reanimated";
import { useUniwind } from "uniwind";
import { useTheme } from "@/hooks/useTheme";
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

// THEME tokens are all `hsl(H S% L%)`, which React Native cannot take an alpha
// on. Rewriting to `hsla(H, S%, L%, a)` keeps the surfaces tied to the same
// token as the text sitting on them.
function withAlpha(color: string, alpha: number): string {
	if (color.startsWith("#") && color.length === 7) {
		const byte = Math.round(Math.min(Math.max(alpha, 0), 1) * 255);
		return color + byte.toString(16).padStart(2, "0");
	}
	const parts = color.match(/-?[\d.]+%?/g);
	if (!parts || parts.length < 3) return color;
	return `hsla(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
}

/** Sourced the way the desktop sources it: `getEditorTheme` takes addition and
 * deletion from the terminal palette's bright green and red in dark, plain green
 * and red in light, and only falls back to chart2/destructive for a theme that
 * carries no terminal colours. Mobile has no terminal palette, so it reads the
 * same xterm defaults the desktop lands on — chart2 is a teal and produced a
 * visibly different diff from the one on the desktop. */
function diffPalette(
	theme: { foreground: string; mutedForeground: string },
	mode: "light" | "dark",
) {
	const ansi = getDefaultTerminalColors(mode);
	const addition = mode === "dark" ? ansi.brightGreen : ansi.green;
	const deletion = mode === "dark" ? ansi.brightRed : ansi.red;
	const { foreground } = theme;
	return {
		text: {
			add: addition,
			del: deletion,
			context: withAlpha(foreground, 0.8),
		},
		sign: { add: foreground, del: foreground, context: "transparent" },
		gutterText: {
			add: foreground,
			del: foreground,
			context: theme.mutedForeground,
		},
		gutterSurface: {
			add: withAlpha(addition, 0.25),
			del: withAlpha(deletion, 0.25),
		},
		rowSurface: {
			add: withAlpha(addition, 0.1),
			del: withAlpha(deletion, 0.1),
		},
	};
}

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
	const theme = useTheme();
	const { theme: mode } = useUniwind();
	const palette = useMemo(() => diffPalette(theme, mode), [theme, mode]);

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
								? palette.gutterSurface.add
								: palette.gutterSurface.del,
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
								? palette.rowSurface.add
								: palette.rowSurface.del,
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
							style={{ color: palette.gutterText[line.type] }}
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
											style={{ color: palette.sign[line.type] }}
										>
											{SIGN[line.type]}
										</RNText>
										<RNText
											allowFontScaling={false}
											style={{ color: palette.text[line.type] }}
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
										style={{ color: palette.sign[line.type] }}
									>
										{SIGN[line.type]}
									</RNText>
									{line.tokens.map((token, tokenIndex) => (
										<RNText
											allowFontScaling={false}
											// biome-ignore lint/suspicious/noArrayIndexKey: tokens are static per line
											key={tokenIndex}
											// Falls back to the line's plain colour, never to
											// nothing: the ancestor sets no colour, so an
											// uncoloured token inherits React Native's default
											// black and vanishes into the diff background. Shiki
											// leaves tokens uncoloured for every language it has
											// no grammar for, which is every extension missing
											// from languageForPath.
											style={{ color: token.color ?? palette.text[line.type] }}
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
