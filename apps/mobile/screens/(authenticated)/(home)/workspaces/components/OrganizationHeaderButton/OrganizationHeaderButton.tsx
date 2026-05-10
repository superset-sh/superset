import { Stack } from "expo-router";
import { ChevronsUpDown } from "lucide-react-native";
import { Pressable } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
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
	return (
		<>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.View hidesSharedBackground>
					<Pressable
						onPress={onPress}
						className="flex-row items-center gap-2"
						style={{ minHeight: 44 }}
						accessibilityRole="button"
						accessibilityLabel={`${name ?? "Organization"} — switch organization`}
					>
						<OrganizationAvatar name={name} logo={logo} size={28} />
						<Text className="text-xl font-semibold text-foreground">
							{name ?? "Organization"}
						</Text>
						<Icon
							as={ChevronsUpDown}
							className="text-muted-foreground size-3.5"
						/>
					</Pressable>
				</Stack.Toolbar.View>
			</Stack.Toolbar>
			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button icon="square.and.pencil" onPress={() => {}} />
			</Stack.Toolbar>
		</>
	);
}
