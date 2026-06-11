import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import type { BottomSheetRef } from "@/components/BottomSheet";
import { NewChatSheet } from "../../components/NewChatSheet";
import { SessionsList } from "../../components/SessionsList";
import {
	MOCK_PROJECT_NAME,
	MOCK_SESSIONS,
	MOCK_WORKSPACES_FOR_NEW_CHAT,
} from "../../mock-data";

export type NewChatSheetViewProps = {
	className?: string;
	autoPresent?: boolean;
};

/**
 * UC-NAV §D — new-chat workspace picker bottom sheet over dimmed sessions
 * list. 5 workspace rows including one with no sessions yet. Tap a row to
 * dismiss the sheet (caller would navigate to the new chat).
 */
export function NewChatSheetView({
	className,
	autoPresent = true,
}: NewChatSheetViewProps) {
	const sheetRef = useRef<BottomSheetRef>(null);

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
						onProjectChipPress: () => {},
						onFilterPress: () => {},
					}}
					onNewChatPress={() => sheetRef.current?.present()}
				/>
				<NewChatSheet
					ref={sheetRef}
					projectName={MOCK_PROJECT_NAME}
					workspaces={MOCK_WORKSPACES_FOR_NEW_CHAT}
					onWorkspaceSelect={() => sheetRef.current?.dismiss()}
					onClose={() => sheetRef.current?.dismiss()}
				/>
			</BottomSheetModalProvider>
		</GestureHandlerRootView>
	);
}
