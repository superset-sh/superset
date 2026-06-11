import { BottomSheetScrollView, BottomSheetView } from "@gorhom/bottom-sheet";
import { Sparkles, X } from "lucide-react-native";
import { forwardRef } from "react";
import { View } from "react-native";
import { BottomSheet, type BottomSheetRef } from "@/components/BottomSheet";
import { IconButton } from "@/components/IconButton";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { WorkspacePickerRow } from "@/components/WorkspacePickerRow";
import type { WorkspacePickerEntry } from "../../types";

export type NewChatSheetProps = {
	projectName: string;
	workspaces: ReadonlyArray<WorkspacePickerEntry>;
	onWorkspaceSelect?: (workspace: WorkspacePickerEntry) => void;
	onClose?: () => void;
};

/**
 * New-chat workspace picker bottom sheet (UC-NAV §D). Renders the workspaces
 * for the active project so the user can pick one to start a new session in.
 *
 * Composes BottomSheet + WorkspacePickerRow. Empty workspaces (`sessionCount`
 * = 0) are still listed.
 */
export const NewChatSheet = forwardRef<BottomSheetRef, NewChatSheetProps>(
	function NewChatSheet(
		{ projectName, workspaces, onWorkspaceSelect, onClose },
		ref,
	) {
		return (
			<BottomSheet ref={ref} snapPoints={["70%", "90%"]} onDismiss={onClose}>
				<BottomSheetView style={{ flex: 1 }}>
					<View className="flex-row items-center justify-between px-4 py-2 border-b border-border">
						<View className="flex-row items-center gap-2 flex-1">
							<Icon as={Sparkles} className="text-muted-foreground size-4" />
							<Text className="text-foreground font-semibold">
								Start a new chat
							</Text>
						</View>
						<IconButton
							icon={X}
							accessibilityLabel="Close new chat sheet"
							variant="ghost"
							size="md"
							onPress={onClose}
						/>
					</View>
					<Text variant="muted" className="px-4 pt-3 pb-2">
						Pick a workspace in {projectName}
					</Text>
					<BottomSheetScrollView contentContainerStyle={{ paddingBottom: 16 }}>
						{workspaces.map((w) => (
							<WorkspacePickerRow
								key={w.id}
								branch={w.branch}
								hostName={w.hostName}
								hostKind={w.hostKind}
								subtitle={
									w.sessionCount === 0
										? "no sessions yet"
										: `${w.sessionCount} session${w.sessionCount === 1 ? "" : "s"}${w.lastActiveTimeLabel ? ` · ${w.lastActiveTimeLabel}` : ""}`
								}
								onPress={() => onWorkspaceSelect?.(w)}
							/>
						))}
					</BottomSheetScrollView>
				</BottomSheetView>
			</BottomSheet>
		);
	},
);
