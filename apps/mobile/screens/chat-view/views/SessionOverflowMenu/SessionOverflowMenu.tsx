import {
	BottomSheetModalProvider,
	BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Edit3, LogOut, type LucideIcon, Trash2 } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Pressable, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheet, type BottomSheetRef } from "@/components/BottomSheet";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ChatView } from "../../components/ChatView";
import {
	MOCK_COMPOSER_SETTINGS,
	MOCK_HEADER,
	MOCK_THREAD_STREAMING,
} from "../../mock-data";

export type SessionOverflowMenuAction = "rename" | "end" | "delete";

export type SessionOverflowMenuProps = {
	className?: string;
	autoPresent?: boolean;
	onAction?: (action: SessionOverflowMenuAction) => void;
};

const MENU_ITEMS: ReadonlyArray<{
	id: SessionOverflowMenuAction;
	label: string;
	icon: LucideIcon;
	destructive?: boolean;
}> = [
	{ id: "rename", label: "Rename", icon: Edit3 },
	{ id: "end", label: "End session", icon: LogOut },
	{ id: "delete", label: "Delete", icon: Trash2, destructive: true },
];

/**
 * UC-SESS-04 §A — session overflow bottom sheet (Rename / End / Delete) over
 * a dimmed chat view. Composes BottomSheet with a Rename/End/Delete list.
 */
export function SessionOverflowMenu({
	className,
	autoPresent = true,
	onAction,
}: SessionOverflowMenuProps) {
	const sheetRef = useRef<BottomSheetRef>(null);

	useEffect(() => {
		if (autoPresent) sheetRef.current?.present();
	}, [autoPresent]);

	const handleSelect = (action: SessionOverflowMenuAction) => {
		onAction?.(action);
		sheetRef.current?.dismiss();
	};

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<BottomSheetModalProvider>
				<ChatView
					className={className}
					header={{ ...MOCK_HEADER }}
					items={MOCK_THREAD_STREAMING}
					composer={{
						state: "idle",
						rowProps: {
							settings: MOCK_COMPOSER_SETTINGS,
							onCommandsPress: () => {},
						},
					}}
				/>
				<BottomSheet ref={sheetRef} snapPoints={["35%"]}>
					<BottomSheetView style={{ paddingVertical: 8 }}>
						{MENU_ITEMS.map((item) => (
							<Pressable
								key={item.id}
								accessibilityRole="button"
								onPress={() => handleSelect(item.id)}
								className="flex-row items-center gap-3 px-5 py-3 min-h-touch-min active:bg-accent"
							>
								<Icon
									as={item.icon}
									className={
										item.destructive
											? "text-state-danger-fg"
											: "text-foreground"
									}
									size={20}
								/>
								<Text
									className={
										item.destructive
											? "text-state-danger-fg"
											: "text-foreground"
									}
								>
									{item.label}
								</Text>
							</Pressable>
						))}
						<View className="h-2" />
					</BottomSheetView>
				</BottomSheet>
			</BottomSheetModalProvider>
		</GestureHandlerRootView>
	);
}
