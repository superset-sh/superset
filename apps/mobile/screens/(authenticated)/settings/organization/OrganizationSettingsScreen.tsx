import Ionicons from "@expo/vector-icons/Ionicons";
import { Trans } from "@lingui/react/macro";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { useSession } from "@/lib/auth/client";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";
import { OrganizationAvatar } from "@/screens/(authenticated)/components/OrganizationAvatar";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import { useOrgMembers } from "@/screens/(authenticated)/hooks/useOrgMembers";
import { UserAvatar } from "../components/UserAvatar";

export function OrganizationSettingsScreen() {
	const theme = useTheme();
	const router = useRouter();
	const { refetch } = useSession();
	const {
		organizations,
		activeOrganization,
		activeOrganizationId,
		switchOrganization,
	} = useOrganizations();
	const members = useOrgMembers();

	const memberRows = useMemo(
		() => [...members].sort((a, b) => a.user.name.localeCompare(b.user.name)),
		[members],
	);

	return (
		<ScrollView
			className="bg-background flex-1"
			contentContainerClassName="px-6 pb-12"
		>
			<View className="items-center gap-2 py-8">
				<OrganizationAvatar
					name={activeOrganization?.name ?? "?"}
					logo={activeOrganization?.logo}
					size={64}
				/>
				<Text
					className="text-lg font-semibold"
					style={{ color: theme.foreground }}
				>
					{activeOrganization?.name}
				</Text>
				{activeOrganization?.slug ? (
					<Text className="text-sm" style={{ color: theme.mutedForeground }}>
						{activeOrganization.slug}
					</Text>
				) : null}
			</View>
			<Text
				className="mb-1 text-sm font-semibold"
				style={{ color: theme.mutedForeground }}
			>
				<Trans>Switch organization</Trans>
			</Text>
			{organizations.map((organization, index) => (
				<ListRow
					key={organization.id}
					icon={
						<OrganizationAvatar
							name={organization.name}
							logo={organization.logo}
							size={32}
						/>
					}
					label={organization.name}
					subtitle={organization.slug ?? undefined}
					trailing={
						organization.id === activeOrganizationId ? (
							<Ionicons
								name="checkmark-circle"
								size={18}
								color={theme.primary}
							/>
						) : null
					}
					onPress={() => {
						router.dismissAll();
						void switchOrganization(organization.id).then(() => refetch());
					}}
					isLast={index === organizations.length - 1}
				/>
			))}
			<Text
				className="mb-1 mt-8 text-sm font-semibold"
				style={{ color: theme.mutedForeground }}
			>
				<Trans>Members</Trans>
			</Text>
			{memberRows.map((row, index) => (
				<ListRow
					key={row.id}
					icon={
						<UserAvatar
							name={row.user.name}
							image={row.user.image}
							className="size-8"
						/>
					}
					label={row.user.name}
					subtitle={row.user.email}
					trailing={
						<Text className="text-sm" style={{ color: theme.mutedForeground }}>
							{row.role[0].toUpperCase() + row.role.slice(1)}
						</Text>
					}
					isLast={index === memberRows.length - 1}
				/>
			))}
		</ScrollView>
	);
}
