import { Plural, useLingui } from "@lingui/react/macro";
import { ChevronsDown, ChevronsUp, ChevronsUpDown } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import type { DiffRow } from "../../utils/computeFileDiff";
import { EXPAND_CHUNK_LINES } from "../../utils/computeFileDiff";
import { EXPANDER_ROW_HEIGHT } from "../../utils/diffMetrics";

type ExpanderDiffRow = Extract<DiffRow, { kind: "expander" }>;

export function ExpanderRow({
	row,
	onExpand,
}: {
	row: ExpanderDiffRow;
	onExpand: (path: string, range: [number, number]) => void;
}) {
	const { t } = useLingui();
	const { newStart, newEnd } = row.gap;
	const hidden = newEnd - newStart + 1;
	if (hidden <= EXPAND_CHUNK_LINES) {
		return (
			<PressableScale
				className="bg-muted/40 border-border flex-row items-center gap-2 border-y px-4"
				style={{ height: EXPANDER_ROW_HEIGHT }}
				onPress={() => onExpand(row.path, [newStart, newEnd])}
			>
				<Icon as={ChevronsUpDown} className="text-muted-foreground size-4" />
				<Text className="text-muted-foreground text-[13px]">
					<Plural
						value={hidden}
						one="Show # hidden line"
						other="Show # hidden lines"
					/>
				</Text>
			</PressableScale>
		);
	}
	return (
		<View
			className="bg-muted/40 border-border flex-row items-center border-y"
			style={{ height: EXPANDER_ROW_HEIGHT }}
		>
			<PressableScale
				accessibilityLabel={t({
					message: "Show lines after the change above",
				})}
				className="flex-row items-center gap-2 px-4 py-2"
				hitSlop={6}
				onPress={() =>
					onExpand(row.path, [newStart, newStart + EXPAND_CHUNK_LINES - 1])
				}
			>
				<Icon as={ChevronsDown} className="text-muted-foreground size-4" />
			</PressableScale>
			{/* The chevrons step through EXPAND_CHUNK_LINES at a time; this opens
			    the rest in one go. No accessibility label of its own — the count
			    it already renders is what a screen reader should read out. */}
			<PressableScale
				className="flex-1 py-2"
				hitSlop={6}
				onPress={() => onExpand(row.path, [newStart, newEnd])}
			>
				<Text className="text-muted-foreground text-center text-[12px]">
					<Plural value={hidden} one="# hidden line" other="# hidden lines" />
				</Text>
			</PressableScale>
			<PressableScale
				accessibilityLabel={t({
					message: "Show lines before the change below",
				})}
				className="flex-row items-center gap-2 px-4 py-2"
				hitSlop={6}
				onPress={() =>
					onExpand(row.path, [newEnd - EXPAND_CHUNK_LINES + 1, newEnd])
				}
			>
				<Icon as={ChevronsUp} className="text-muted-foreground size-4" />
			</PressableScale>
		</View>
	);
}
