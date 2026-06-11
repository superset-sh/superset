import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useEffect, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import type { BottomSheetRef } from "@/components/BottomSheet";
import { ProjectPickerSheet } from "../../components/ProjectPickerSheet";
import { SessionsList } from "../../components/SessionsList";
import {
	MOCK_PROJECT_NAME,
	MOCK_PROJECTS,
	MOCK_SESSIONS,
} from "../../mock-data";

export type ProjectPickerSheetViewProps = {
	className?: string;
	autoPresent?: boolean;
};

/**
 * UC-NAV §B — project picker bottom sheet open over a dimmed sessions list.
 * Composes ProjectPickerSheet organism + SessionsList shell behind it.
 * Tap a project row to update the selected indicator (useState).
 */
export function ProjectPickerSheetView({
	className,
	autoPresent = true,
}: ProjectPickerSheetViewProps) {
	const sheetRef = useRef<BottomSheetRef>(null);
	const [selectedId, setSelectedId] = useState("p1");

	useEffect(() => {
		if (autoPresent) sheetRef.current?.present();
	}, [autoPresent]);

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<BottomSheetModalProvider>
				<SessionsList
					className={className}
					projectName={MOCK_PROJECT_NAME}
					sessions={MOCK_SESSIONS}
					headerProps={{
						variant: "multi-project",
						onMenuPress: () => {},
						onProjectChipPress: () => sheetRef.current?.present(),
						onFilterPress: () => {},
					}}
					onSessionPress={() => {}}
					onNewChatPress={() => {}}
				/>
				<ProjectPickerSheet
					ref={sheetRef}
					projects={MOCK_PROJECTS}
					selectedProjectId={selectedId}
					onProjectSelect={(p) => {
						setSelectedId(p.id);
						sheetRef.current?.dismiss();
					}}
					onClose={() => sheetRef.current?.dismiss()}
				/>
			</BottomSheetModalProvider>
		</GestureHandlerRootView>
	);
}
