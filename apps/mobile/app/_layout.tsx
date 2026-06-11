import "react-native-get-random-values"; // MUST BE FIRST IMPORT
import "../global.css";

import {
	Geist_400Regular,
	Geist_500Medium,
	Geist_600SemiBold,
	Geist_700Bold,
	useFonts,
} from "@expo-google-fonts/geist";
import {
	GeistMono_400Regular,
	GeistMono_500Medium,
} from "@expo-google-fonts/geist-mono";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { RootLayout } from "@/screens/RootLayout";

SplashScreen.preventAutoHideAsync().catch(() => {
	/* splash already hidden — fine to swallow */
});

const StorybookRoot =
	process.env.EXPO_PUBLIC_STORYBOOK === "true"
		? require("../.rnstorybook").default
		: null;

export default function App() {
	const [fontsLoaded, fontError] = useFonts({
		Geist_400Regular,
		Geist_500Medium,
		Geist_600SemiBold,
		Geist_700Bold,
		GeistMono_400Regular,
		GeistMono_500Medium,
	});

	useEffect(() => {
		if (fontsLoaded || fontError) {
			if (fontError) {
				console.error("Font loading failed:", fontError);
			}
			SplashScreen.hideAsync().catch(() => {});
		}
	}, [fontsLoaded, fontError]);

	if (!fontsLoaded && !fontError) return null;

	const Root = StorybookRoot ?? RootLayout;
	return <Root />;
}
