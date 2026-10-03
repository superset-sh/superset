import { useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { useRouter } from "expo-router";
import { Archive } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useArchivedCloudWorkspaces } from "@/hooks/useArchivedCloudWorkspaces";
import { useCloudWorkspaces } from "@/hooks/useCloudWorkspaces";
import { useTheme } from "@/hooks/useTheme";
import { posthog } from "@/lib/posthog";
import {
	type CloudStatusFilter,
	useWorkspacesFilterStore,
} from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";
import { useCloudFilters } from "@/screens/(authenticated)/(home)/hooks/useCloudFilters";
import { CloudIcon } from "@/screens/(authenticated)/components/CloudIcon";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";
import { ListRowCheck } from "@/screens/(authenticated)/components/ListRowCheck";

export function StatusFilterScreen() {
	const { t } = useLingui();
	const router = useRouter();
	const theme = useTheme();
	const { formatNumber } = useFormat();
	const setCloudStatus = useWorkspacesFilterStore(
		(store) => store.setCloudStatus,
	);
	const { status, matchesCreator } = useCloudFilters();
	const { workspaces: active } = useCloudWorkspaces();
	const { workspaces: archived } = useArchivedCloudWorkspaces();

	const options: {
		value: CloudStatusFilter;
		label: string;
		icon: typeof Archive;
		count: number;
	}[] = [
		{
			value: "active",
			label: t({ message: "Active", context: "cloud workspace status" }),
			icon: CloudIcon,
			count: active.filter((row) => matchesCreator(row.createdByUserId)).length,
		},
		{
			value: "archived",
			label: t({ message: "Archived" }),
			icon: Archive,
			count: archived.filter((row) => matchesCreator(row.createdByUserId))
				.length,
		},
	];

	return (
		<View className="bg-background flex-1 px-6">
			{options.map((option, index) => (
				<ListRow
					key={option.value}
					icon={
						<Icon
							as={option.icon}
							className="text-muted-foreground size-5"
							strokeWidth={1.75}
						/>
					}
					label={option.label}
					trailing={
						<>
							<Text style={{ color: theme.mutedForeground }}>
								{formatNumber(option.count)}
							</Text>
							<ListRowCheck visible={option.value === status} />
						</>
					}
					onPress={() => {
						setCloudStatus(option.value);
						posthog.capture("filter_applied", {
							filter: "cloud_status",
							value: option.value,
						});
						router.back();
					}}
					isLast={index === options.length - 1}
				/>
			))}
		</View>
	);
}
