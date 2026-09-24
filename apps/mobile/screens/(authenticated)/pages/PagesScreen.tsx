import { LegendList } from "@legendapp/list/react-native";
import { useLingui } from "@lingui/react/macro";
import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, View } from "react-native";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { PageRow } from "./components/PageRow";
import { type OrgPage, usePagesQuery } from "./hooks/usePages";
import { usePagesFilterStore } from "./stores/pagesFilterStore";

export function PagesScreen() {
	const { t } = useLingui();
	const router = useRouter();
	const [refreshing, setRefreshing] = useState(false);
	const scope = usePagesFilterStore((state) => state.scope);
	const hasHydrated = usePagesFilterStore((state) => state.hasHydrated);
	const pages = usePagesQuery(scope);
	const offline = pages.status === "pending" && pages.fetchStatus === "paused";
	const visible = pages.items;

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await pages.refetch().catch(() => {});
		setRefreshing(false);
	}, [pages]);

	const renderItem = useCallback(
		({ item }: { item: OrgPage }) => <PageRow page={item} />,
		[],
	);

	if (pages.isLoading || !hasHydrated) {
		return (
			<View className="bg-background flex-1 items-center justify-center">
				<Spinner className="size-5" />
			</View>
		);
	}

	return (
		<>
			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button
					icon={
						scope === "all"
							? "line.3.horizontal.decrease"
							: "line.3.horizontal.decrease.circle.fill"
					}
					accessibilityLabel={t({ message: "Filter pages" })}
					onPress={() => {
						void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						router.push("/(authenticated)/pages/filter");
					}}
				/>
			</Stack.Toolbar>

			<LegendList
				className="bg-background flex-1"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{ paddingBottom: 32, paddingTop: 8 }}
				data={visible}
				extraData={renderItem}
				keyExtractor={(page) => page.id}
				renderItem={renderItem}
				onEndReachedThreshold={0.5}
				onEndReached={() => {
					if (pages.hasNextPage && !pages.isFetchingNextPage) {
						void pages.fetchNextPage();
					}
				}}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
				ListEmptyComponent={
					<View className="items-center justify-center px-8 py-20">
						<Text className="text-muted-foreground text-center">
							{offline
								? t({ message: "You are offline" })
								: pages.error
									? t({ message: "Pages could not be loaded" })
									: scope === "all"
										? t({ message: "No pages yet" })
										: t({ message: "No pages match this filter" })}
						</Text>
						{offline || pages.error || scope !== "all" ? null : (
							<Text className="text-muted-foreground/70 mt-1 text-center text-sm">
								{t({
									message: "Ask an agent to publish one from the desktop app.",
								})}
							</Text>
						)}
					</View>
				}
			/>
		</>
	);
}
