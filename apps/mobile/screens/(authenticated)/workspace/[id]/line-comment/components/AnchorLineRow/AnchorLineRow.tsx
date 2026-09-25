import { Text as RNText, View } from "react-native";
import { cn } from "@/lib/utils";
import type { DiffToken } from "../../../files-changed/utils/computeFileDiff";
import {
	DIFF_FONT_SIZE,
	DIFF_LINE_HEIGHT,
	GUTTER_WIDTH,
} from "../../../files-changed/utils/diffMetrics";

const MONO_STYLE = { fontSize: DIFF_FONT_SIZE, lineHeight: DIFF_LINE_HEIGHT };

const SIGN = { add: "+ ", del: "− ", context: "  " } as const;

const TEXT_CLASS = {
	add: "text-green-400",
	del: "text-red-400",
	context: "text-foreground/80",
} as const;

const GUTTER_BG = {
	add: "bg-green-500/25",
	del: "bg-red-500/25",
	context: undefined,
} as const;

const CODE_BG = {
	add: "bg-green-500/10",
	del: "bg-red-500/10",
	context: undefined,
} as const;

/** Static single-line rendering for the comment composer's anchor card. */
export function AnchorLineRow({
	type,
	lineNumber,
	text,
	tokens,
}: {
	type: "add" | "del" | "context";
	lineNumber: number | null;
	text: string;
	tokens?: DiffToken[];
}) {
	return (
		<View className="flex-row" style={{ height: DIFF_LINE_HEIGHT }}>
			<View
				className={cn("flex-none", GUTTER_BG[type])}
				style={{ width: GUTTER_WIDTH }}
			>
				<RNText
					allowFontScaling={false}
					className="text-foreground/70 pr-1.5 text-right font-mono"
					style={MONO_STYLE}
				>
					{lineNumber ?? ""}
				</RNText>
			</View>
			<View className={cn("flex-1 overflow-hidden", CODE_BG[type])}>
				<RNText
					allowFontScaling={false}
					className={cn(
						"font-mono",
						tokens ? "text-foreground/90" : TEXT_CLASS[type],
					)}
					ellipsizeMode="clip"
					numberOfLines={1}
					style={MONO_STYLE}
				>
					<RNText allowFontScaling={false} className="text-foreground/90">
						{SIGN[type]}
					</RNText>
					{tokens
						? tokens.map((token, index) => (
								<RNText
									allowFontScaling={false}
									// biome-ignore lint/suspicious/noArrayIndexKey: tokens static
									key={index}
									style={token.color ? { color: token.color } : undefined}
								>
									{token.content}
								</RNText>
							))
						: text}
				</RNText>
			</View>
		</View>
	);
}
