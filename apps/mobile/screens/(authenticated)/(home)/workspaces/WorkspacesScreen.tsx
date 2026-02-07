import { useLiveQuery } from "@tanstack/react-db";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, View, useWindowDimensions } from "react-native";
import { Text } from "@/components/ui/text";
import { authClient } from "@/lib/auth/client";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { OrganizationHeaderButton } from "./components/OrganizationHeaderButton";
import { OrganizationSwitcherSheet } from "./components/OrganizationSwitcherSheet";

export function WorkspacesScreen() {
	const router = useRouter();
	const collections = useCollections();
	const [refreshing, setRefreshing] = useState(false);
	const [sheetOpen, setSheetOpen] = useState(false);
	const { width } = useWindowDimensions();

	const session = authClient.useSession();
	const activeOrganizationId = session.data?.session?.activeOrganizationId;

	const { data: organizations } = useLiveQuery(
		(q) => q.from({ organizations: collections.organizations }),
		[collections],
	);

	const activeOrganization = organizations?.find(
		(organization) => organization.id === activeOrganizationId,
	);

	const handleSwitchOrganization = async (organizationId: string) => {
		if (organizationId === activeOrganizationId) return;
		setSheetOpen(false);
		try {
			await authClient.organization.setActive({ organizationId });
			router.replace("/(authenticated)/(home)");
		} catch (error) {
			console.error("[organization/switch] Failed to switch organization:", error);
		}
	};

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		// TODO: refresh workspace data
		setRefreshing(false);
	}, []);

	return (
		<>
			<OrganizationHeaderButton
				name={activeOrganization?.name}
				logo={activeOrganization?.logo}
				onPress={() => setSheetOpen(true)}
			/>
			<ScrollView
				className="flex-1 bg-background"
				contentInsetAdjustmentBehavior="automatic"
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
			>
				<View className="p-6">
					<View className="items-center justify-center py-20">
						<Text className="text-muted-foreground text-center">
							Workspaces grouped by project will appear here
						</Text>
					</View>
				</View>
			</ScrollView>
			<OrganizationSwitcherSheet
				isPresented={sheetOpen}
				onIsPresentedChange={setSheetOpen}
				organizations={organizations ?? []}
				activeOrganizationId={activeOrganizationId}
				onSwitchOrganization={handleSwitchOrganization}
				width={width}
			/>
		</>
	);
}
