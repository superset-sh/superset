import "react-native-get-random-values"; // MUST BE FIRST IMPORT
import "../global.css";

import { RootLayout } from "@/screens/RootLayout";

// Storybook root toggle: when EXPO_PUBLIC_STORYBOOK=true, swap the entire root
// for the Storybook UI. When falsy (default for all EAS production profiles),
// Metro dead-code-eliminates the require() so @storybook/react-native and all
// *.stories.tsx files are excluded from the production bundle.
// See: plans/chat-mobile-plan/13-testing-strategy.md
const StorybookRoot =
	process.env.EXPO_PUBLIC_STORYBOOK === "true"
		? require("../.rnstorybook").default
		: null;

export default StorybookRoot ?? RootLayout;
