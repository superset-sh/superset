import { Stack } from "expo-router";
import { ChevronsUpDown } from "lucide-react-native";
import { Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import { OrganizationAvatar } from "@/screens/(authenticated)/components/OrganizationAvatar";

export function OrganizationHeaderButton({
	name,
	logo,
	isLoading,
	onPress,
}: {
	name?: string;
	logo?: string | null;
	isLoading?: boolean;
	onPress: () => void;
}) {
	// Naming an organization we have not loaded yet would be a guess, and the
	// guess is wrong for everyone who belongs to more than one.
	if (isLoading) return null;
	return (
		<Stack.Toolbar placement="left">
			<Stack.Toolbar.View hidesSharedBackground>
				<Pressable onPress={onPress} className="flex-row items-center gap-2">
					<OrganizationAvatar name={name} logo={logo} size={28} />
					<Text className="text-xl font-semibold text-foreground">
						{name ?? "Organization"}
					</Text>
					<ChevronsUpDown size={14} color="hsl(240 5% 64.9%)" />
				</Pressable>
			</Stack.Toolbar.View>
		</Stack.Toolbar>
	);
}
