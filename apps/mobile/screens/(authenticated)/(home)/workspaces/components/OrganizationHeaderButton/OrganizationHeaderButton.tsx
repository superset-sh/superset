import { Stack } from "expo-router";
import { ChevronsUpDown } from "lucide-react-native";
import { Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { OrganizationAvatar } from "../OrganizationSwitcherSheet/components/OrganizationAvatar";

export function OrganizationHeaderButton({
	name,
	logo,
	onPress,
}: {
	name?: string;
	logo?: string | null;
	onPress: () => void;
}) {
	const theme = useTheme();
	return (
		<>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.View hidesSharedBackground>
					<Pressable onPress={onPress} className="flex-row items-center gap-2">
						<OrganizationAvatar name={name} logo={logo} size={28} />
						<Text className="text-xl font-semibold text-foreground">
							{name ?? "Organization"}
						</Text>
						<ChevronsUpDown size={14} color={theme.mutedForeground} />
					</Pressable>
				</Stack.Toolbar.View>
			</Stack.Toolbar>
			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button icon="square.and.pencil" onPress={() => {}} />
			</Stack.Toolbar>
		</>
	);
}
