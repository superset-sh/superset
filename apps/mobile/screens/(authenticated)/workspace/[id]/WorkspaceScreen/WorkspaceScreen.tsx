import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { GitPullRequestArrow } from "lucide-react-native";
import { useMemo } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import { cn } from "@/lib/utils";
import { NewChatWidget } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget";
import { SessionRow } from "@/screens/(authenticated)/(home)/home/components/SessionRow";
import { useHostAcpSessions } from "@/screens/(authenticated)/(home)/home/hooks/useHostAcpSessions";
import { buildSessionRows } from "@/screens/(authenticated)/(home)/home/utils/sessionRows";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import { useWorkspaceChangeset } from "../hooks/useWorkspaceChangeset";
import { useWorkspaceHeaderActions } from "../hooks/useWorkspaceHeaderActions";
import { useWorkspacePullRequest } from "../hooks/useWorkspacePullRequest";

const GLASS = isLiquidGlassAvailable();

const NAVIGATION_BAR_HEIGHT = 44;

const glassHeaderOptions = {
	headerShown: true,
	headerTransparent: true,
	headerLargeTitle: false,
	headerBackButtonDisplayMode: "minimal",
	headerShadowVisible: false,
	...(GLASS ? {} : { headerBlurEffect: "systemUltraThinMaterial" as const }),
	headerStyle: { backgroundColor: "transparent" },
} as const;

export function WorkspaceScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const { height: windowHeight } = useWindowDimensions();
	const insets = useSafeAreaInsets();

	const { workspace, host } = useWorkspaceHost(id ?? null);
	const { sessionsByWorkspace, isReady } = useHostAcpSessions(host);
	const { renameWorkspace, deleteWorkspace, copyId, shareWorkspace } =
		useWorkspaceHeaderActions(workspace, host);
	const changeset = useWorkspaceChangeset(id ?? null);
	const pullRequest = useWorkspacePullRequest(id ?? null);

	const sessionRows = useMemo(
		() => buildSessionRows(id ? (sessionsByWorkspace.get(id) ?? []) : []),
		[sessionsByWorkspace, id],
	);

	const widgetWorkspaces = useMemo<HostWorkspaceItem[]>(
		() => (workspace ? [{ ...workspace, hostReachable: true }] : []),
		[workspace],
	);

	const hasChanges = changeset.files.length > 0;

	return (
		<View className="bg-background flex-1">
			<Stack.Screen
				options={{ ...glassHeaderOptions, title: workspace?.name ?? "" }}
			>
				<Stack.Title asChild>
					<View className="max-w-64 items-center">
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
					<Stack.Toolbar.Menu
						icon="ellipsis"
						accessibilityLabel="Workspace options"
						hidden={!workspace}
					>
						<Stack.Toolbar.MenuAction
							icon="pencil"
							onPress={() => void renameWorkspace()}
						>
							Rename
						</Stack.Toolbar.MenuAction>
						{workspace?.type !== "main" ? (
							<Stack.Toolbar.MenuAction icon="trash" onPress={deleteWorkspace}>
								Delete
							</Stack.Toolbar.MenuAction>
						) : null}
						<Stack.Toolbar.Menu inline>
							<Stack.Toolbar.MenuAction icon="doc.on.doc" onPress={copyId}>
								Copy ID
							</Stack.Toolbar.MenuAction>
							<Stack.Toolbar.MenuAction
								icon="square.and.arrow.up"
								onPress={shareWorkspace}
							>
								Share
							</Stack.Toolbar.MenuAction>
						</Stack.Toolbar.Menu>
					</Stack.Toolbar.Menu>
				</Stack.Toolbar>
			</Stack.Screen>
			<ScrollView
				className="flex-1"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{
					paddingTop: 4,
					paddingBottom: 132,
					// Short content doesn't engage the scroll pan below the last row —
					// stretch the container to the viewport (same fix as HomeScreen).
					minHeight:
						windowHeight - insets.top - NAVIGATION_BAR_HEIGHT - insets.bottom,
				}}
				keyboardDismissMode="interactive"
			>
				{sessionRows.map((row, index) => (
					<View key={row.id}>
						{index > 0 && <View className="border-border/40 ml-12 border-t" />}
						<SessionRow
							row={row}
							className="px-4 py-3"
							onPress={() =>
								router.push(
									`/(authenticated)/workspace/${id}/chat/acp/${row.id}`,
								)
							}
						/>
					</View>
				))}
				{sessionRows.length === 0 && isReady && (
					<View className="items-center py-20">
						<Text className="text-muted-foreground text-sm">
							No chats in this workspace yet.
						</Text>
					</View>
				)}
			</ScrollView>
			{workspace ? (
				<NewChatWidget
					workspaces={widgetWorkspaces}
					fixedTarget={{
						workspaceId: workspace.id,
						workspaceName: workspace.name,
						branch: workspace.branch,
						hostId: workspace.hostId,
					}}
					above={
						hasChanges ? (
							<PressableScale
								onPress={() =>
									router.push(`/(authenticated)/workspace/${id}/diff`)
								}
							>
								<GlassView
									colorScheme="dark"
									glassEffectStyle="regular"
									style={{ borderRadius: 999, overflow: "hidden" }}
								>
									<View
										className={cn(
											"flex-row items-center gap-2 px-4 py-3",
											!GLASS && "bg-card border-border rounded-full border",
										)}
									>
										<Icon
											as={GitPullRequestArrow}
											className="text-foreground size-5"
											strokeWidth={1.75}
										/>
										<Text className="font-medium text-[15px]">
											{pullRequest ? "View PR" : "View changes"}
										</Text>
										<Text className="text-green-500 font-semibold text-[15px]">
											+{changeset.additions.toLocaleString()}
										</Text>
										<Text className="text-red-500 font-semibold text-[15px]">
											−{changeset.deletions.toLocaleString()}
										</Text>
									</View>
								</GlassView>
							</PressableScale>
						) : undefined
					}
				/>
			) : null}
		</View>
	);
}
