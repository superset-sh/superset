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

// Storybook root toggle: when EXPO_PUBLIC_STORYBOOK=true, swap the entire root
// for the Storybook UI. When falsy (default for all EAS production profiles),
// Metro dead-code-eliminates the require() so @storybook/react-native and all
// *.stories.tsx files are excluded from the production bundle.
// See: plans/chat-mobile-plan/13-testing-strategy.md
const StorybookRoot =
	process.env.EXPO_PUBLIC_STORYBOOK === "true"
		? require("../.rnstorybook").default
		: null;

export default function App() {
	const [fontsLoaded] = useFonts({
		Geist_400Regular,
		Geist_500Medium,
		Geist_600SemiBold,
		Geist_700Bold,
		GeistMono_400Regular,
		GeistMono_500Medium,
	});

	useEffect(() => {
		if (fontsLoaded) {
			SplashScreen.hideAsync().catch(() => {});
		}
	}, [fontsLoaded]);

	if (!fontsLoaded) return null;

	const Root = StorybookRoot ?? RootLayout;
	return <Root />;
}
