import { PortalHost } from "@rn-primitives/portal";
import type { Preview } from "@storybook/react-native";
import { View } from "react-native";
import { cn } from "@/lib/utils";

// NavigationContainer is provided by StorybookRouterProvider —
// do NOT add one here or SDK 56's expo-router compat check will fail.
const preview: Preview = {
	decorators: [
		(Story, context) => {
			const isFullscreen = context.parameters?.layout === "fullscreen";
			return (
				<View className={cn("flex-1 bg-background", !isFullscreen && "p-4")}>
					<Story />
					<PortalHost />
				</View>
			);
		},
	],
	parameters: {
		controls: {
			matchers: {
				color: /(background|color|foreground)$/i,
				date: /Date$/i,
			},
		},
		moduleMock: {
			mockingPairedModules: {
				tty: () => require("./mocks/tty"),
			},
		},
	},
};

export default preview;
