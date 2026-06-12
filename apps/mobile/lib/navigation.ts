import type { NativeStackNavigationOptions } from "expo-router/build/react-navigation/native-stack";

export const titledScreenOptions: NativeStackNavigationOptions = {
	headerLargeTitle: true,
	headerLargeTitleStyle: { fontSize: 26, fontWeight: "600" },
	headerShadowVisible: false,
};
