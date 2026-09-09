import { LegendList } from "@legendapp/list/react-native";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useState } from "react";
import { RefreshControl, View } from "react-native";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { PageRow } from "./components/PageRow";
import { NO_PAGES, type OrgPage, usePagesQuery } from "./hooks/usePages";

export function PagesScreen() {
	const { t } = useLingui();
	const [refreshing, setRefreshing] = useState(false);
	const pages = usePagesQuery();

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await pages.refetch().catch(() => {});
		setRefreshing(false);
	}, [pages]);

	const renderItem = useCallback(
		({ item }: { item: OrgPage }) => <PageRow page={item} />,
		[],
	);

	if (pages.isPending) {
		return (
			<View className="bg-background flex-1 items-center justify-center">
				<Spinner className="size-5" />
			</View>
		);
	}

	return (
		<LegendList
			className="bg-background flex-1"
			contentInsetAdjustmentBehavior="automatic"
			contentContainerStyle={{ paddingBottom: 32, paddingTop: 8 }}
			data={pages.data ?? NO_PAGES}
			extraData={renderItem}
			keyExtractor={(page) => page.id}
			renderItem={renderItem}
			refreshControl={
				<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
			}
			ListEmptyComponent={
				<View className="items-center justify-center px-8 py-20">
					<Text className="text-muted-foreground text-center">
						{pages.error
							? t({ message: "Pages could not be loaded" })
							: t({ message: "No pages yet" })}
					</Text>
					{pages.error ? null : (
						<Text className="text-muted-foreground/70 mt-1 text-center text-sm">
							{t({
								message: "Ask an agent to publish one from the desktop app.",
							})}
						</Text>
					)}
				</View>
			}
		/>
	);
}
