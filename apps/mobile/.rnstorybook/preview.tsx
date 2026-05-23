import { PortalHost } from "@rn-primitives/portal";
import type { Preview } from "@storybook/react-native";
import { View } from "react-native";

// NOTE: Do NOT import from `expo-router/react-navigation` here. Storybook 9 RN
// imports preview.tsx during prep (`createPreparedStoryMapping`), which
// evaluates module top-levels eagerly. Loading expo-router's nav module reads
// the default `UnhandledLinkingContext` value, whose getters throw
// "Couldn't find an UnhandledLinkingContext context." There is no decorator
// fix — decorators apply at render time, not prep time. Keep nav-context
// providers out of this file entirely.
const preview: Preview = {
	decorators: [
		(Story) => (
			<View className="flex-1 bg-background p-4">
				<Story />
				<PortalHost />
			</View>
		),
	],
	parameters: {
		controls: {
			matchers: {
				color: /(background|color|foreground)$/i,
				date: /Date$/i,
			},
		},
	},
};

export default preview;
