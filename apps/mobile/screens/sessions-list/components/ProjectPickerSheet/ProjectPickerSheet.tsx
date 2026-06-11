import { BottomSheetView } from "@gorhom/bottom-sheet";
import { X } from "lucide-react-native";
import { forwardRef } from "react";
import { View } from "react-native";
import { BottomSheet, type BottomSheetRef } from "@/components/BottomSheet";
import { IconButton } from "@/components/IconButton";
import { ProjectPickerRow } from "@/components/ProjectPickerRow";
import { Text } from "@/components/ui/text";
import type { Project } from "../../types";

export type ProjectPickerSheetProps = {
	projects: ReadonlyArray<Project>;
	selectedProjectId: string;
	onProjectSelect?: (project: Project) => void;
	onClose?: () => void;
};

/**
 * Project picker bottom sheet (UC-NAV §B). Renders the project list in a
 * 50% snap-point sheet over the dimmed sessions list.
 *
 * Composes BottomSheet + ProjectPickerRow. Imperative API via ref:
 *   const sheetRef = useRef<BottomSheetRef>(null);
 *   sheetRef.current?.present();
 */
export const ProjectPickerSheet = forwardRef<
	BottomSheetRef,
	ProjectPickerSheetProps
>(function ProjectPickerSheet(
	{ projects, selectedProjectId, onProjectSelect, onClose },
	ref,
) {
	return (
		<BottomSheet ref={ref} snapPoints={["50%", "85%"]} onDismiss={onClose}>
			<BottomSheetView style={{ flex: 1 }}>
				<View className="flex-row items-center justify-between px-4 py-2 border-b border-border">
					<View className="flex-1" />
					<Text className="text-foreground font-semibold">Switch project</Text>
					<View className="flex-1 items-end">
						<IconButton
							icon={X}
							accessibilityLabel="Close project picker"
							variant="ghost"
							size="md"
							onPress={onClose}
						/>
					</View>
				</View>
				<Text
					variant="muted"
					className="text-xs font-mono uppercase tracking-wider px-4 pt-3 pb-1"
				>
					This organization
				</Text>
				<View>
					{projects.map((p) => (
						<ProjectPickerRow
							key={p.id}
							name={p.name}
							subtitle={`${p.workspaceCount} workspace${p.workspaceCount === 1 ? "" : "s"} · ${
								p.sessionCount === 0
									? "no sessions yet"
									: `${p.sessionCount} session${p.sessionCount === 1 ? "" : "s"}`
							}`}
							selected={p.id === selectedProjectId}
							onPress={() => onProjectSelect?.(p)}
						/>
					))}
				</View>
			</BottomSheetView>
		</BottomSheet>
	);
});
