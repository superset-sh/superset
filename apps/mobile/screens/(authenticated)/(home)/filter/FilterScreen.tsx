import Ionicons from "@expo/vector-icons/Ionicons";
import { useLiveQuery } from "@tanstack/react-db";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { SheetCloseButton } from "@/screens/(authenticated)/(home)/components/SheetCloseButton";
import { useSelectedHost } from "@/screens/(authenticated)/(home)/hooks/useSelectedHost";
import {
	SORT_OPTIONS,
	useWorkspacesFilterStore,
} from "@/screens/(authenticated)/(home)/workspaces/stores/workspacesFilterStore";
import { HostStatusDot } from "@/screens/(authenticated)/components/HostStatusDot";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";
import { ListRowValue } from "@/screens/(authenticated)/components/ListRowValue";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { ProjectAvatar } from "./components/ProjectAvatar";

export function FilterScreen() {
	const router = useRouter();
	const theme = useTheme();
	const collections = useCollections();
	const projectFilter = useWorkspacesFilterStore(
		(store) => store.projectFilter,
	);
	const selectedHost = useSelectedHost();
	const sort = useWorkspacesFilterStore((store) => store.sort);

	const { data: projects } = useLiveQuery(
		(q) => q.from({ v2Projects: collections.v2Projects }),
		[collections],
	);

	const sortedProjects = [...(projects ?? [])].sort((a, b) =>
		a.name.localeCompare(b.name),
	);
	const selectedProject =
		sortedProjects.find((project) => project.id === projectFilter) ??
		sortedProjects[0];
	const sortLabel =
		SORT_OPTIONS.find((option) => option.value === sort)?.label ?? "";

	return (
		<View className="bg-background flex-1 px-6">
			<View className="relative mb-2 mt-5 items-center justify-center">
				<View className="absolute left-0">
					<SheetCloseButton onPress={() => router.back()} />
				</View>
				<Text
					className="text-center text-lg font-semibold"
					style={{ color: theme.foreground }}
				>
					Filter
				</Text>
			</View>
			<ListRow
				icon={
					<Ionicons
						name="folder-outline"
						size={20}
						color={theme.mutedForeground}
					/>
				}
				label="Project"
				trailing={
					<ListRowValue
						value={selectedProject?.name ?? "All"}
						accessory={
							selectedProject ? (
								<ProjectAvatar
									name={selectedProject.name}
									iconUrl={selectedProject.iconUrl}
									size={22}
								/>
							) : undefined
						}
					/>
				}
				onPress={() => router.push("/(authenticated)/(home)/filter/project")}
			/>
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
