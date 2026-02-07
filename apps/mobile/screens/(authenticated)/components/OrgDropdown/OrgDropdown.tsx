import { useLiveQuery } from "@tanstack/react-db";
import { useRouter } from "expo-router";
import {
	ArrowLeftRight,
	ChevronDown,
	LogOut,
	Settings,
	UserPlus,
} from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useSignOut } from "@/hooks/useSignOut";
import { authClient } from "@/lib/auth/client";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";

export function OrgDropdown() {
	const router = useRouter();
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
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<View className="flex-row items-center gap-3 px-4 py-3">
					<Avatar alt={activeOrg?.name ?? "Organization"} className="size-9">
						<AvatarFallback>
							<Text className="text-sm font-semibold">{orgInitial}</Text>
						</AvatarFallback>
					</Avatar>
					<View className="flex-1">
						<Text className="text-base font-semibold" numberOfLines={1}>
							{activeOrg?.name ?? "Select Organization"}
						</Text>
					</View>
					<Icon as={ChevronDown} className="text-muted-foreground size-4" />
				</View>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-56" align="start" side="bottom">
				<DropdownMenuItem
					onPress={() => router.push("/(authenticated)/settings")}
				>
					<Icon as={Settings} className="text-foreground size-4" />
					<Text>Settings</Text>
				</DropdownMenuItem>
				<DropdownMenuItem>
					<Icon as={UserPlus} className="text-foreground size-4" />
					<Text>Invite members</Text>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				{orgs
					?.filter((org) => org.id !== activeOrgId)
					.map((org) => (
						<DropdownMenuItem
							key={org.id}
							onPress={() => handleSwitchOrg(org.id)}
							disabled={switching}
						>
							<Icon as={ArrowLeftRight} className="text-foreground size-4" />
							<Text numberOfLines={1}>Switch to {org.name}</Text>
						</DropdownMenuItem>
					))}
				{orgs && orgs.filter((org) => org.id !== activeOrgId).length > 0 && (
					<DropdownMenuSeparator />
				)}
				<DropdownMenuItem variant="destructive" onPress={signOut}>
					<Icon as={LogOut} className="text-destructive size-4" />
					<Text>Log out</Text>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
