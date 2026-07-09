import Ionicons from "@expo/vector-icons/Ionicons";
import { useLiveQuery } from "@tanstack/react-db";
import { useRouter } from "expo-router";
import { Alert, ScrollView, View } from "react-native";
import { useSignOut } from "@/hooks/useSignOut";
import { useTheme } from "@/hooks/useTheme";
import { useSession } from "@/lib/auth/client";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";
import { ListRowValue } from "@/screens/(authenticated)/components/ListRowValue";
import { OrganizationAvatar } from "@/screens/(authenticated)/components/OrganizationAvatar";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { UserAvatar } from "./components/UserAvatar";
import { activeSubscription } from "./utils/activeSubscription";

export function SettingsScreen() {
	const router = useRouter();
	const theme = useTheme();
	const collections = useCollections();
	const { data: session } = useSession();
	const { activeOrganization } = useOrganizations();
	const { signOut, isSigningOut } = useSignOut();

	const { data: subscriptions } = useLiveQuery(
		(q) => q.from({ subscriptions: collections.subscriptions }),
		[collections],
	);

	const plan = activeSubscription(subscriptions ?? [])?.plan;
	const user = session?.user;

	const handleSignOut = () => {
		Alert.alert("Log out?", undefined, [
			{ style: "cancel", text: "Cancel" },
			{
				onPress: () => void signOut(),
				style: "destructive",
				text: "Log out",
			},
		]);
	};

	return (
		<ScrollView
			className="bg-background flex-1"
			contentContainerClassName="px-6 pb-12"
		>
			<ListRow
				icon={<UserAvatar name={user?.name ?? "?"} image={user?.image} />}
				label={user?.name ?? "Account"}
				subtitle={user?.email}
				trailing={
					<Ionicons
						name="chevron-forward"
						size={18}
						color={theme.mutedForeground}
					/>
				}
				onPress={() => router.push("/(authenticated)/settings/account")}
			/>
			<ListRow
				icon={
					<Ionicons
						name="people-outline"
						size={20}
						color={theme.mutedForeground}
					/>
				}
				label="Organization"
				trailing={
					<ListRowValue
						value={activeOrganization?.name ?? ""}
						accessory={
							activeOrganization ? (
								<OrganizationAvatar
									name={activeOrganization.name}
									logo={activeOrganization.logo}
									size={20}
								/>
							) : undefined
						}
					/>
				}
				onPress={() => router.push("/(authenticated)/settings/organization")}
			/>
			<ListRow
				icon={
					<Ionicons
						name="desktop-outline"
						size={20}
						color={theme.mutedForeground}
					/>
				}
				label="Hosts"
				trailing={
					<Ionicons
						name="chevron-forward"
						size={18}
						color={theme.mutedForeground}
					/>
				}
				onPress={() => router.push("/(authenticated)/settings/hosts")}
			/>
			<ListRow
				icon={
					<Ionicons
						name="card-outline"
						size={20}
						color={theme.mutedForeground}
					/>
				}
				label="Billing"
				trailing={
					<ListRowValue
						value={plan ? plan[0].toUpperCase() + plan.slice(1) : "Free"}
					/>
				}
				onPress={() => router.push("/(authenticated)/settings/billing")}
				isLast
			/>
			<View className="my-2 h-px" style={{ backgroundColor: theme.border }} />
			<ListRow
				icon={
					<Ionicons
						name="log-out-outline"
						size={20}
						color={theme.destructive}
					/>
				}
				label="Log out"
				destructive
				onPress={isSigningOut ? undefined : handleSignOut}
				isLast
			/>
		</ScrollView>
	);
}
