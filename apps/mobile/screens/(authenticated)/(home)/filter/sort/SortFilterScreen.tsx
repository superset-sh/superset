import { useRouter } from "expo-router";
import { View } from "react-native";
import {
	SORT_OPTIONS,
	useWorkspacesFilterStore,
} from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";
import { ListRowCheck } from "@/screens/(authenticated)/components/ListRowCheck";

export function SortFilterScreen() {
	const router = useRouter();
	const sort = useWorkspacesFilterStore((store) => store.sort);
	const setSort = useWorkspacesFilterStore((store) => store.setSort);

	return (
		<View className="bg-background flex-1 px-6">
			{SORT_OPTIONS.map((option, index) => (
				<ListRow
					key={option.value}
					label={option.label}
					trailing={<ListRowCheck visible={option.value === sort} />}
					onPress={() => {
						setSort(option.value);
						router.back();
					}}
					isLast={index === SORT_OPTIONS.length - 1}
				/>
			))}
		</View>
	);
}
