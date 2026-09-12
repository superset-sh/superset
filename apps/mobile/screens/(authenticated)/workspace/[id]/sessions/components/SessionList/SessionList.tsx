import { Trans } from "@lingui/react/macro";
import { useCallback } from "react";
import { View } from "react-native";
import ReorderableList, {
	type ReorderableListReorderEvent,
	reorderItems,
} from "react-native-reorderable-list";
import { withUniwind } from "uniwind";
import { Text } from "@/components/ui/text";
import type { TerminalRowData } from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import { SessionRow } from "./components/SessionRow";

const TerminalReorderableList = withUniwind(ReorderableList<TerminalRowData>);

interface SessionListProps {
	rows: TerminalRowData[];
	activeTerminalId: string | null;
	onSelect: (terminalId: string) => void;
	onReorder: (terminalIds: string[]) => void;
	onClose: (row: TerminalRowData) => void;
}

/**
 * Reorderable list of the workspace's sessions, drag handle per row. The
 * drag — lift, gap, edge auto-scroll, drop — is ReorderableList's; rows only
 * decide when to pick up.
 */
export function SessionList({
	rows,
	activeTerminalId,
	onSelect,
	onReorder,
	onClose,
}: SessionListProps) {
	const handleReorder = useCallback(
		({ from, to }: ReorderableListReorderEvent) => {
			onReorder(
				reorderItems(
					rows.map((row) => row.terminalId),
					from,
					to,
				),
			);
		},
		[rows, onReorder],
	);

	return (
		<TerminalReorderableList
			className="bg-background flex-1"
			data={rows}
			keyExtractor={(row) => row.terminalId}
			onReorder={handleReorder}
			contentInsetAdjustmentBehavior="automatic"
			// grow lets the empty state center in the sheet; with rows present the
			// content sizes normally.
			contentContainerClassName="grow px-2 pb-8"
			ListEmptyComponent={
				<View className="flex-1 items-center justify-center gap-1">
					<Text className="text-muted-foreground text-sm">
						<Trans>No sessions</Trans>
					</Text>
					<Text className="text-muted-foreground/70 text-xs">
						<Trans>Start one with + in the tab strip.</Trans>
					</Text>
				</View>
			}
			renderItem={({ item }) => (
				<SessionRow
					row={item}
					active={item.terminalId === activeTerminalId}
					onSelect={onSelect}
					onClose={onClose}
				/>
			)}
		/>
	);
}
