import { ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { useSession } from "@/lib/auth/client";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";
import { ListRowValue } from "@/screens/(authenticated)/components/ListRowValue";
import { UserAvatar } from "../components/UserAvatar";

export function AccountSettingsScreen() {
	const theme = useTheme();
	const { data: session } = useSession();
	const user = session?.user;

	return (
		<ScrollView
			className="bg-background flex-1"
			contentContainerClassName="px-6 pb-12"
		>
			<View className="items-center gap-2 py-8">
				<UserAvatar
					name={user?.name ?? "?"}
					image={user?.image}
					className="size-16"
					textClassName="text-lg"
				/>
				<Text
					className="text-lg font-semibold"
					style={{ color: theme.foreground }}
				>
					{user?.name}
				</Text>
				<Text className="text-sm" style={{ color: theme.mutedForeground }}>
					{user?.email}
				</Text>
			</View>
			<ListRow
				label="Name"
				trailing={<ListRowValue value={user?.name ?? ""} chevron={false} />}
			/>
			<ListRow
				label="Email"
				trailing={<ListRowValue value={user?.email ?? ""} chevron={false} />}
				isLast
			/>
		</ScrollView>
	);
}
