import type { DrawerContentComponentProps } from "@react-navigation/drawer";
import { usePathname, useRouter } from "expo-router";
import { CheckSquare, LayoutGrid } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { OrgDropdown } from "./components/OrgDropdown";

const NAV_ITEMS = [
	{
		label: "Workspaces",
		icon: LayoutGrid,
		href: "/(authenticated)/(drawer)/workspaces" as const,
		matchPath: "/workspaces",
	},
	{
		label: "Tasks",
		icon: CheckSquare,
		href: "/(authenticated)/(drawer)/tasks" as const,
		matchPath: "/tasks",
	},
];

export function DrawerContent(_props: DrawerContentComponentProps) {
	const router = useRouter();
	const pathname = usePathname();
	const insets = useSafeAreaInsets();

	return (
		<View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
			<OrgDropdown />
			<Separator />
			<View className="flex-1 px-2 py-2 gap-1">
				{NAV_ITEMS.map((item) => {
					const isActive = pathname.includes(item.matchPath);
					return (
						<Pressable
							key={item.href}
							onPress={() => router.replace(item.href)}
							className={`flex-row items-center gap-3 rounded-lg px-3 py-2.5 ${
								isActive ? "bg-accent" : ""
							}`}
						>
							<Icon
								as={item.icon}
								className={`size-5 ${
									isActive ? "text-accent-foreground" : "text-muted-foreground"
								}`}
							/>
							<Text
								className={`text-sm font-medium ${
									isActive ? "text-accent-foreground" : "text-muted-foreground"
								}`}
							>
								{item.label}
							</Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}
