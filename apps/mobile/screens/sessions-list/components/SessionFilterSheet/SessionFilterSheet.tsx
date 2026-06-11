import { BottomSheetScrollView, BottomSheetView } from "@gorhom/bottom-sheet";
import { X } from "lucide-react-native";
import { forwardRef, useState } from "react";
import { View } from "react-native";
import { BottomSheet, type BottomSheetRef } from "@/components/BottomSheet";
import {
	FilterCheckboxRow,
	type FilterStatusValue,
} from "@/components/FilterCheckboxRow";
import { IconButton } from "@/components/IconButton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import type { FilterValueWorkspace, SessionsFilters } from "../../types";

const STATUS_OPTIONS: ReadonlyArray<{
	value: FilterStatusValue;
	label: string;
}> = [
	{ value: "streaming", label: "Streaming" },
	{ value: "pause-pending", label: "Pause pending" },
	{ value: "idle", label: "Idle" },
];

export type SessionFilterSheetProps = {
	workspaces: ReadonlyArray<FilterValueWorkspace>;
	initialFilters: SessionsFilters;
	onApply?: (next: SessionsFilters) => void;
	onClose?: () => void;
};

/**
 * Full filter sheet (UC-NAV-08 §C). Two stacked sections (Workspaces +
 * Status) with multi-select FilterCheckboxRow per row, and a docked footer
 * with Clear all / Apply buttons.
 *
 * Internal state stays in the sheet — only commits via `onApply` on tap.
 */
export const SessionFilterSheet = forwardRef<
	BottomSheetRef,
	SessionFilterSheetProps
>(function SessionFilterSheet(
	{ workspaces, initialFilters, onApply, onClose },
	ref,
) {
	const [workspaceIds, setWorkspaceIds] = useState<ReadonlyArray<string>>(
		initialFilters.workspaceIds,
	);
	const [statuses, setStatuses] = useState<ReadonlyArray<FilterStatusValue>>(
		initialFilters.statuses,
	);

	const toggleWorkspace = (id: string) =>
		setWorkspaceIds((curr) =>
			curr.includes(id) ? curr.filter((w) => w !== id) : [...curr, id],
		);

	const toggleStatus = (value: FilterStatusValue) =>
		setStatuses((curr) =>
			curr.includes(value) ? curr.filter((s) => s !== value) : [...curr, value],
		);

	const clearAll = () => {
		setWorkspaceIds([]);
		setStatuses([]);
	};

	const apply = () => {
		onApply?.({ workspaceIds, statuses });
	};

	return (
		<BottomSheet ref={ref} snapPoints={["85%"]} onDismiss={onClose}>
			<BottomSheetView style={{ flex: 1 }}>
				<View className="flex-row items-center justify-between px-4 py-2 border-b border-border">
					<View className="flex-1" />
					<Text className="text-foreground font-semibold">Filter sessions</Text>
					<View className="flex-1 items-end">
						<IconButton
							icon={X}
							accessibilityLabel="Close filter sheet"
							variant="ghost"
							size="md"
							onPress={onClose}
						/>
					</View>
				</View>
				<BottomSheetScrollView contentContainerStyle={{ paddingBottom: 16 }}>
					<Text
						variant="muted"
						className="text-xs font-mono uppercase tracking-wider px-4 pt-3 pb-1"
					>
						Workspaces
					</Text>
					{workspaces.map((w) => (
						<FilterCheckboxRow
							key={w.id}
							kind="workspace"
							branch={w.branch}
							hostName={w.hostName}
							hostKind={w.hostKind}
							checked={workspaceIds.includes(w.id)}
							onCheckedChange={() => toggleWorkspace(w.id)}
						/>
					))}
					<Separator className="my-2" />
					<Text
						variant="muted"
						className="text-xs font-mono uppercase tracking-wider px-4 pt-1 pb-1"
					>
						Status
					</Text>
					{STATUS_OPTIONS.map((o) => (
						<FilterCheckboxRow
							key={o.value}
							kind="status"
							statusValue={o.value}
							label={o.label}
							checked={statuses.includes(o.value)}
							onCheckedChange={() => toggleStatus(o.value)}
						/>
					))}
				</BottomSheetScrollView>
				<View className="flex-row gap-2 px-4 pt-2 pb-4 border-t border-border">
					<Button variant="outline" className="flex-1" onPress={clearAll}>
						<Text>Clear all</Text>
					</Button>
					<Button className="flex-1" onPress={apply}>
						<Text>Apply</Text>
					</Button>
				</View>
			</BottomSheetView>
		</BottomSheet>
	);
});
