import { isLiquidGlassAvailable } from "expo-glass-effect";
import type { NativeStackNavigationOptions } from "expo-router/build/react-navigation/native-stack";
import { Platform } from "react-native";

export const titledScreenOptions: NativeStackNavigationOptions = {
	headerShadowVisible: false,
};

/** A sheet's native header: transparent, glass where the OS draws it, content scrolling underneath. */
export const glassHeaderOptions = {
	headerShown: true,
	headerTransparent: true,
	headerLargeTitle: false,
	headerBackButtonDisplayMode: "minimal",
	headerShadowVisible: false,
	...(isLiquidGlassAvailable()
		? {}
		: { headerBlurEffect: "systemUltraThinMaterial" as const }),
	headerStyle: { backgroundColor: "transparent" },
} as const;

// iPad shows a form sheet as a fixed-size centered card, so a partial detent
// only shrinks the card and clips what is inside it.
export const sheetDetents = (phoneDetents: number[]) =>
	Platform.OS === "ios" && Platform.isPad ? [1.0] : phoneDetents;
