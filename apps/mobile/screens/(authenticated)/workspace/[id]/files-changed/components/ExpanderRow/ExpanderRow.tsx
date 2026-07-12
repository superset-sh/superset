import { ChevronsDown, ChevronsUp, ChevronsUpDown } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import type { DiffRow } from "../../utils/computeFileDiff";
import { EXPAND_CHUNK_LINES } from "../../utils/computeFileDiff";

type ExpanderDiffRow = Extract<DiffRow, { kind: "expander" }>;

export function ExpanderRow({
	row,
	onExpand,
}: {
	row: ExpanderDiffRow;
	onExpand: (path: string, range: [number, number]) => void;
}) {
	const { newStart, newEnd } = row.gap;
	const hidden = newEnd - newStart + 1;
	if (hidden <= EXPAND_CHUNK_LINES) {
		return (
			<PressableScale
				className="bg-sky-500/10 border-sky-500/15 flex-row items-center gap-2 border-y px-4 py-2"
				onPress={() => onExpand(row.path, [newStart, newEnd])}
			>
				<Icon as={ChevronsUpDown} className="text-sky-400 size-4" />
				<Text className="text-sky-400 text-[13px]">
					Show {hidden} hidden {hidden === 1 ? "line" : "lines"}
				</Text>
			</PressableScale>
		);
	}
	return (
		<View className="bg-sky-500/10 border-sky-500/15 flex-row items-center border-y">
			<PressableScale
				accessibilityLabel="Show lines after the change above"
				className="flex-row items-center gap-2 px-4 py-2"
				hitSlop={6}
				onPress={() =>
					onExpand(row.path, [newStart, newStart + EXPAND_CHUNK_LINES - 1])
				}
			>
				<Icon as={ChevronsDown} className="text-sky-400 size-4" />
			</PressableScale>
			<Text className="text-muted-foreground flex-1 text-center text-[12px]">
				{hidden} hidden lines
			</Text>
			<PressableScale
				accessibilityLabel="Show lines before the change below"
				className="flex-row items-center gap-2 px-4 py-2"
				hitSlop={6}
				onPress={() =>
					onExpand(row.path, [newEnd - EXPAND_CHUNK_LINES + 1, newEnd])
				}
			>
				<Icon as={ChevronsUp} className="text-sky-400 size-4" />
			</PressableScale>
		</View>
	);
}
