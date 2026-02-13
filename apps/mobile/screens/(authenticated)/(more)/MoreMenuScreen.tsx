import { useLiveQuery } from "@tanstack/react-db";
import { useRouter } from "expo-router";
import {
	ArrowLeftRight,
	ChevronRight,
	LogOut,
	Settings,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { useSignOut } from "@/hooks/useSignOut";
import { authClient } from "@/lib/auth/client";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";

export function MoreMenuScreen() {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { signOut } = useSignOut();
	const collections = useCollections();
	const [switching, setSwitching] = useState(false);

	const session = authClient.useSession();
	const activeOrgId = session.data?.session?.activeOrganizationId;

	const { data: orgs } = useLiveQuery(
		(q) => q.from({ organizations: collections.organizations }),
		[collections],
	);

	const activeOrg = orgs?.find((org) => org.id === activeOrgId);
	const orgInitial = activeOrg?.name?.charAt(0).toUpperCase() ?? "?";
	const otherOrgs = orgs?.filter((org) => org.id !== activeOrgId) ?? [];

	const handleSwitchOrg = async (orgId: string) => {
		if (orgId === activeOrgId) return;
		setSwitching(true);
		try {
			await authClient.organization.setActive({ organizationId: orgId });
			router.replace("/(authenticated)/(home)");
		} catch (error) {
			console.error("[org/switch] Failed to switch organization:", error);
		} finally {
			setSwitching(false);
		}
	};

	return (
		<ScrollView
			className="flex-1 bg-background"
			contentContainerStyle={{ paddingTop: insets.top + 16 }}
		>
			<View className="px-4 gap-6">
				{/* Org section */}
				<View className="gap-2">
					<Text className="text-xs font-medium text-muted-foreground uppercase px-2">
						Organization
					</Text>
					<View className="rounded-xl bg-card">
						<View className="flex-row items-center gap-3 px-4 py-3">
							<Avatar
								alt={activeOrg?.name ?? "Organization"}
								className="size-9"
							>
								<AvatarFallback>
									<Text className="text-sm font-semibold">{orgInitial}</Text>
								</AvatarFallback>
							</Avatar>
							<Text
								className="text-base font-semibold flex-1"
								numberOfLines={1}
							>
								{activeOrg?.name ?? "Select Organization"}
							</Text>
						</View>
						{otherOrgs.length > 0 && (
							<>
								<Separator />
								{otherOrgs.map((org) => (
									<Pressable
										key={org.id}
										onPress={() => handleSwitchOrg(org.id)}
										disabled={switching}
										className="flex-row items-center gap-3 px-4 py-3"
									>
										<Icon
											as={ArrowLeftRight}
											className="text-muted-foreground size-5"
										/>
										<Text className="text-base flex-1" numberOfLines={1}>
											Switch to {org.name}
										</Text>
									</Pressable>
								))}
							</>
						)}
					</View>
				</View>

				{/* Menu items */}
				<View className="gap-2">
					<Text className="text-xs font-medium text-muted-foreground uppercase px-2">
						General
					</Text>
					<View className="rounded-xl bg-card">
						<Pressable
							onPress={() => router.push("/(authenticated)/(more)/settings")}
							className="flex-row items-center gap-3 px-4 py-3"
						>
							<Icon as={Settings} className="text-foreground size-5" />
							<Text className="text-base flex-1">Settings</Text>
							<Icon
								as={ChevronRight}
								className="text-muted-foreground size-5"
							/>
						</Pressable>
					</View>
				</View>

				{/* Sign out */}
				<View className="gap-2">
					<View className="rounded-xl bg-card">
						<Pressable
							onPress={signOut}
							className="flex-row items-center gap-3 px-4 py-3"
						>
							<Icon as={LogOut} className="text-destructive size-5" />
							<Text className="text-base text-destructive">Log out</Text>
						</Pressable>
					</View>
				</View>
			</View>
		</ScrollView>
	);
}
