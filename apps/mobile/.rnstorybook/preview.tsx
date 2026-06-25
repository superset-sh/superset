import { PortalHost } from "@rn-primitives/portal";
import type { Preview } from "@storybook/react-native";
import { ScrollView, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Uniwind } from "uniwind";
import "../global.css";

Uniwind.setTheme("dark");

const preview: Preview = {
	decorators: [
		(Story) => (
			<GestureHandlerRootView style={{ flex: 1 }}>
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
			</GestureHandlerRootView>
		),
	],
	parameters: {},
};

export default preview;
