import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import {
	background,
	environment,
	presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import type { SelectV2Workspace } from "@superset/db/schema";
import { Pencil, Trash2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { apiClient } from "@/lib/trpc/client";

export function WorkspaceActionsSheet({
	workspace,
	isPresented,
	onIsPresentedChange,
	width,
}: {
	workspace: SelectV2Workspace | null;
	isPresented: boolean;
	onIsPresentedChange: (value: boolean) => void;
	width: number;
}) {
	const theme = useTheme();
	const [retained, setRetained] = useState<SelectV2Workspace | null>(workspace);

	useEffect(() => {
		if (workspace) setRetained(workspace);
	}, [workspace]);

	const target = workspace ?? retained;

	const handleRename = () => {
		const ws = target;
		onIsPresentedChange(false);
		if (!ws) return;
		setTimeout(() => {
			Alert.prompt(
				"Rename workspace",
				undefined,
				[
					{ style: "cancel", text: "Cancel" },
					{
						onPress: async (name?: string) => {
							const trimmed = name?.trim();
							if (!trimmed || trimmed === ws.name) return;
							try {
								await apiClient.v2Workspace.update.mutate({
									id: ws.id,
									name: trimmed,
								});
							} catch {
								Alert.alert("Rename failed");
							}
						},
						text: "Rename",
					},
				],
				"plain-text",
				ws.name,
			);
		}, 350);
	};

	const handleDelete = () => {
		const ws = target;
		onIsPresentedChange(false);
		if (!ws) return;
		setTimeout(() => {
			Alert.alert("Delete workspace", `Delete "${ws.name}"?`, [
				{ style: "cancel", text: "Cancel" },
				{
					onPress: async () => {
						try {
							await apiClient.v2Workspace.delete.mutate({ id: ws.id });
						} catch {
							Alert.alert("Delete failed");
						}
					},
					style: "destructive",
					text: "Delete",
				},
			]);
		}, 350);
	};

	return (
		<Host style={{ position: "absolute", width }}>
			<BottomSheet
				isPresented={isPresented}
				onIsPresentedChange={onIsPresentedChange}
				fitToContents
			>
				<Group
					modifiers={[
						environment("colorScheme", "dark"),
						presentationDragIndicator("visible"),
						background(theme.background),
					]}
				>
					<RNHostView matchContents>
						<View className="gap-1 px-4 pb-10 pt-5">
							<Text
								className="mb-2 px-3 text-sm font-medium"
								style={{ color: theme.mutedForeground }}
								numberOfLines={1}
							>
								{target?.name}
							</Text>
							<Pressable
								onPress={handleRename}
								className="flex-row items-center gap-3 rounded-xl px-3 py-3.5"
							>
								<Pencil size={20} color={theme.foreground} />
								<Text
									className="text-base font-medium"
									style={{ color: theme.foreground }}
								>
									Rename
								</Text>
							</Pressable>
							<Pressable
								onPress={handleDelete}
								className="flex-row items-center gap-3 rounded-xl px-3 py-3.5"
							>
								<Trash2 size={20} color={theme.destructive} />
								<Text
									className="text-base font-medium"
									style={{ color: theme.destructive }}
								>
									Delete
								</Text>
							</Pressable>
						</View>
					</RNHostView>
				</Group>
			</BottomSheet>
		</Host>
	);
}
