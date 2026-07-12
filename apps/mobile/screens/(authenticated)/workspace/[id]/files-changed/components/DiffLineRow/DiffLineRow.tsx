import { Pressable, Text as RNText, View } from "react-native";
import Animated, {
	type SharedValue,
	useAnimatedStyle,
} from "react-native-reanimated";
import { cn } from "@/lib/utils";
import type { DiffRow } from "../../utils/computeFileDiff";
import {
	DIFF_FONT_SIZE,
	DIFF_LINE_HEIGHT,
	GUTTER_WIDTH,
	SIGN_WIDTH,
} from "../../utils/diffMetrics";

type LineRow = Extract<DiffRow, { kind: "line" }>;

const GUTTER_BG_CLASS = {
	add: "bg-green-500/25",
	del: "bg-red-500/25",
	context: undefined,
} as const;

const CODE_BG_CLASS = {
	add: "bg-green-500/10",
	del: "bg-red-500/10",
	context: undefined,
} as const;

const LINE_SIGN = { add: "+", del: "−", context: " " } as const;

const SIGN_CLASS = {
	add: "text-green-400",
	del: "text-red-400",
	context: "text-transparent",
} as const;

const PLAIN_TEXT_CLASS = {
	add: "text-green-400",
	del: "text-red-400",
	context: "text-foreground/80",
} as const;

const MONO_STYLE = { fontSize: DIFF_FONT_SIZE, lineHeight: DIFF_LINE_HEIGHT };

export function DiffLineRow({
	row,
	contentWidth,
	codeViewportWidth,
	scrollX,
	onPress,
}: {
	row: LineRow;
	/** Fixed width of the code text so long lines never wrap. */
	contentWidth: number;
	codeViewportWidth: number;
	/** Absent = static rendering (comment-composer anchor card). */
	scrollX?: SharedValue<number>;
	onPress?: (row: LineRow) => void;
}) {
	const rowMaxOffset = Math.max(0, contentWidth - codeViewportWidth);
	const panStyle = useAnimatedStyle(() => {
		if (!scrollX) return {};
		return {
			transform: [{ translateX: -Math.min(scrollX.value, rowMaxOffset) }],
		};
	});

	const body = (
		<>
			<View
				className={cn("flex-none justify-start", GUTTER_BG_CLASS[row.type])}
				style={{ width: GUTTER_WIDTH }}
			>
				<RNText
					className={cn(
						"pr-1.5 text-right font-mono",
						row.type === "context"
							? "text-muted-foreground/50"
							: "text-foreground/70",
					)}
					style={MONO_STYLE}
				>
					{row.newLineNumber ?? row.oldLineNumber ?? ""}
				</RNText>
			</View>
			<View
				className={cn(
					"flex-1 flex-row overflow-hidden",
					CODE_BG_CLASS[row.type],
				)}
			>
				<Animated.View className="flex-row" style={panStyle}>
					<RNText
						className={cn("pl-1 font-mono", SIGN_CLASS[row.type])}
						style={[MONO_STYLE, { width: SIGN_WIDTH }]}
					>
						{LINE_SIGN[row.type]}
					</RNText>
					<RNText
						className={cn(
							"font-mono",
							row.tokens ? "text-foreground/90" : PLAIN_TEXT_CLASS[row.type],
						)}
						ellipsizeMode="clip"
						numberOfLines={1}
						style={[MONO_STYLE, { width: contentWidth }]}
					>
						{row.tokens
							? row.tokens.map((token, index) => (
									<RNText
										className="font-mono"
										// biome-ignore lint/suspicious/noArrayIndexKey: tokens are static per row
										key={index}
										style={[
											MONO_STYLE,
											token.color ? { color: token.color } : undefined,
										]}
									>
										{token.content}
									</RNText>
								))
							: row.text}
					</RNText>
				</Animated.View>
			</View>
		</>
	);

	if (!onPress) return <View className="flex-row">{body}</View>;
	return (
		<Pressable className="flex-row" onPress={() => onPress(row)}>
			{body}
		</Pressable>
	);
}
