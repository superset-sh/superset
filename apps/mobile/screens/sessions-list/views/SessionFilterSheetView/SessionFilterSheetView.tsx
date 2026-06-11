import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useEffect, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import type { BottomSheetRef } from "@/components/BottomSheet";
import { SessionFilterSheet } from "../../components/SessionFilterSheet";
import { SessionsList } from "../../components/SessionsList";
import {
	MOCK_FILTER_WORKSPACES,
	MOCK_PROJECT_NAME,
	MOCK_SESSIONS,
} from "../../mock-data";
import type { SessionsFilters } from "../../types";

export type SessionFilterSheetViewProps = {
	className?: string;
	autoPresent?: boolean;
};

const INITIAL: SessionsFilters = {
	workspaceIds: ["fw1", "fw2"],
	statuses: ["streaming"],
};

/**
 * UC-NAV-08 §C — full filter sheet (85vh) over dimmed sessions list.
 * Composes SessionFilterSheet organism + SessionsList behind. Apply commits
 * the new filters and dismisses the sheet (useState).
 */
export function SessionFilterSheetView({
	className,
	autoPresent = true,
}: SessionFilterSheetViewProps) {
	const sheetRef = useRef<BottomSheetRef>(null);
	const [filters, setFilters] = useState<SessionsFilters>(INITIAL);

	useEffect(() => {
		if (autoPresent) sheetRef.current?.present();
	}, [autoPresent]);

	const filterCount = filters.workspaceIds.length + filters.statuses.length;

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<BottomSheetModalProvider>
				<SessionsList
					className={className}
					projectName={MOCK_PROJECT_NAME}
					sessions={MOCK_SESSIONS}
					headerProps={{
						variant: "multi-project",
						filterCount,
						onMenuPress: () => {},
						onProjectChipPress: () => {},
						onFilterPress: () => sheetRef.current?.present(),
					}}
					onSessionPress={() => {}}
					onNewChatPress={() => {}}
				/>
				<SessionFilterSheet
					ref={sheetRef}
					workspaces={MOCK_FILTER_WORKSPACES}
					initialFilters={filters}
					onApply={(next) => {
						setFilters(next);
						sheetRef.current?.dismiss();
					}}
					onClose={() => sheetRef.current?.dismiss()}
				/>
			</BottomSheetModalProvider>
		</GestureHandlerRootView>
	);
}
