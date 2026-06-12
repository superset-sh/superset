import { PortalHost } from "@rn-primitives/portal";
import type { Preview } from "@storybook/react-native";
import { ScrollView, View } from "react-native";
import { Uniwind } from "uniwind";
import "../global.css";

Uniwind.setTheme("dark");

const preview: Preview = {
	decorators: [
		(Story) => (
			<View className="bg-background flex-1">
				<ScrollView
					className="flex-1"
					contentContainerClassName="grow items-center justify-center gap-4 p-6"
					alwaysBounceVertical
				>
					<Story />
				</ScrollView>
				<PortalHost />
			</View>
		),
	],
	parameters: {},
};

export default preview;
