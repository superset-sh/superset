import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Stack, useLocalSearchParams } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import { THEME } from "@/lib/theme";
import { useWorkspaceHeaderActions } from "@/screens/(authenticated)/workspace/[id]/hooks/useWorkspaceHeaderActions";

// The tabs are a screen of the ROOT authenticated stack (no intermediate
// stack), so pushing from home yields a real native back button. Header
// elements must be DIRECT children of Stack.Screen — the composition matcher
// drops wrapper components.
const glassHeaderOptions = {
	headerShown: true,
	headerTransparent: true,
	headerLargeTitle: false,
	headerBackButtonDisplayMode: "minimal",
	headerShadowVisible: false,
	...(isLiquidGlassAvailable()
		? {}
		: { headerBlurEffect: "systemUltraThinMaterial" as const }),
	headerStyle: { backgroundColor: "transparent" },
} as const;

export default function WorkspaceTabsLayout() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const { workspace, host } = useWorkspaceHost(id ?? null);
	const { startNewChat, renameWorkspace, copyBranch, creatingChat } =
		useWorkspaceHeaderActions(workspace, host);

	return (
		<>
			<Stack.Screen
				options={{ ...glassHeaderOptions, title: workspace?.name ?? "" }}
			>
				<Stack.Title asChild>
					<View className="max-w-52 items-center">
						<Text className="font-semibold text-[17px]" numberOfLines={1}>
							{workspace?.name ?? ""}
						</Text>
						{workspace?.branch ? (
							<Text className="text-muted-foreground text-xs" numberOfLines={1}>
								{workspace.branch}
							</Text>
						) : null}
					</View>
				</Stack.Title>
				<Stack.Toolbar placement="right">
					<Stack.Toolbar.Button
						icon="square.and.pencil"
						accessibilityLabel="New chat"
						disabled={!workspace || !host || creatingChat}
						onPress={() => void startNewChat()}
					/>
					<Stack.Toolbar.Menu
						icon="ellipsis"
						accessibilityLabel="Workspace options"
						hidden={!workspace}
					>
						<Stack.Toolbar.MenuAction icon="doc.on.doc" onPress={copyBranch}>
							Copy branch
						</Stack.Toolbar.MenuAction>
						<Stack.Toolbar.MenuAction
							icon="pencil"
							onPress={() => void renameWorkspace()}
						>
							Rename workspace
						</Stack.Toolbar.MenuAction>
					</Stack.Toolbar.Menu>
				</Stack.Toolbar>
			</Stack.Screen>
			<NativeTabs tintColor={THEME.dark.foreground}>
				<NativeTabs.Trigger name="index">
					<NativeTabs.Trigger.Icon sf="bubble.left" />
					<NativeTabs.Trigger.Label>Chats</NativeTabs.Trigger.Label>
				</NativeTabs.Trigger>
				<NativeTabs.Trigger name="diff">
					<NativeTabs.Trigger.Icon sf="plus.forwardslash.minus" />
					<NativeTabs.Trigger.Label>Diff</NativeTabs.Trigger.Label>
				</NativeTabs.Trigger>
			</NativeTabs>
		</>
	);
}
