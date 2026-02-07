import { DrawerActions, useTheme } from "@react-navigation/native";
import { useNavigation } from "expo-router";
import { Menu } from "lucide-react-native";
import { Pressable } from "react-native";

export function DrawerToggleButton() {
	const navigation = useNavigation();
	const { colors } = useTheme();

	return (
		<Pressable
			onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
			hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
			style={{ paddingLeft: 16 }}
		>
			<Menu size={24} color={colors.text} />
		</Pressable>
	);
}
