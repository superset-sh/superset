import { useLiveQuery } from "@tanstack/react-db";
import { useState } from "react";
import { View } from "react-native";
import { authClient } from "@/lib/auth/client";
import { useCollections } from "@/providers/CollectionsProvider";
import { Button } from "../ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../ui/card";
import { Text } from "../ui/text";

export function OrganizationSwitcher() {
	const collections = useCollections();
	const [switching, setSwitching] = useState(false);

	// Get all organizations
	const { data: orgs } = useLiveQuery(
		(q) => q.from({ organizations: collections.organizations }),
		[collections],
	);

	// Get current session to know active org
	const session = authClient.useSession();
	const activeOrgId = session.data?.session?.activeOrganizationId;

	const handleSwitchOrg = async (orgId: string) => {
		if (orgId === activeOrgId) return;

		setSwitching(true);
		try {
			await authClient.organization.setActive({
				organizationId: orgId,
			});
			// Refresh the page to reload collections
			// Note: In React Native, we might need to handle this differently
		} catch (error) {
			console.error("Failed to switch organization:", error);
		} finally {
			setSwitching(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Organizations</CardTitle>
				<CardDescription>
					{orgs?.length || 0} organization(s) available
				</CardDescription>
			</CardHeader>
			<CardContent className="gap-3">
				{orgs?.map((org) => {
					const isActive = org.id === activeOrgId;
					return (
						<View key={org.id} className="gap-2">
							<View className="flex-row items-center justify-between">
								<View className="flex-1">
									<Text className="font-semibold">{org.name}</Text>
									{org.slug && (
										<Text className="text-sm text-muted-foreground">
											@{org.slug}
										</Text>
									)}
								</View>
								{isActive ? (
									<Text className="text-sm text-primary font-medium">
										Active
									</Text>
								) : (
									<Button
										variant="outline"
										size="sm"
										onPress={() => handleSwitchOrg(org.id)}
										disabled={switching}
									>
										<Text>Switch</Text>
									</Button>
								)}
							</View>
						</View>
					);
				})}
			</CardContent>
		</Card>
	);
}
