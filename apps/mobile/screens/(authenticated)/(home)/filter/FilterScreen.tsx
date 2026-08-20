import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, useRouter } from "expo-router";
import { View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import {
	SORT_OPTIONS,
	useWorkspacesFilterStore,
} from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";
import { useSelectedHost } from "@/screens/(authenticated)/(home)/hooks/useSelectedHost";
import { HostStatusDot } from "@/screens/(authenticated)/components/HostStatusDot";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";
import { ListRowValue } from "@/screens/(authenticated)/components/ListRowValue";

export function FilterScreen() {
	const router = useRouter();
	const theme = useTheme();
	const selectedHost = useSelectedHost();
	const sort = useWorkspacesFilterStore((store) => store.sort);

	const sortLabel =
		SORT_OPTIONS.find((option) => option.value === sort)?.label ?? "";

	return (
		<View className="bg-background flex-1 px-6">
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button icon="xmark" onPress={() => router.back()} />
			</Stack.Toolbar>
			<ListRow
				icon={
					<Ionicons
						name="desktop-outline"
						size={20}
						color={theme.mutedForeground}
					/>
				}
				label="Host"
				trailing={
					<ListRowValue
						value={selectedHost?.name ?? ""}
						accessory={
							selectedHost ? (
								<HostStatusDot isOnline={selectedHost.isOnline} />
							) : undefined
						}
					/>
				}
				onPress={() => router.push("/(authenticated)/(home)/filter/host")}
			/>
			<ListRow
				icon={
					<Ionicons
						name="swap-vertical"
						size={20}
						color={theme.mutedForeground}
					/>
				}
				label="Sort"
				trailing={<ListRowValue value={sortLabel} />}
				onPress={() => router.push("/(authenticated)/(home)/filter/sort")}
				isLast
			/>
		</View>
	);
}
