import { PortalHost } from "@rn-primitives/portal";
import type { Preview } from "@storybook/react-native";
import { ScrollView, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Uniwind } from "uniwind";
import "../global.css";

Uniwind.setTheme("dark");

const preview: Preview = {
	decorators: [
		(Story, context) => {
			// Screen-width components own their own margins, so the usual preview
			// padding would render them narrower than they ever are on device —
			// and every gap read off them would be wrong.
			const fullBleed = context.parameters.fullBleed === true;
			return (
				<GestureHandlerRootView style={{ flex: 1 }}>
					<View className="bg-background flex-1">
						<ScrollView
							alwaysBounceVertical
							className="flex-1"
							contentContainerClassName={
								fullBleed
									? "grow justify-center py-6"
									: "grow items-center justify-center gap-4 p-6"
							}
						>
							<Story />
						</ScrollView>
						<PortalHost />
					</View>
				</GestureHandlerRootView>
			);
		},
	],
	parameters: {},
};

export default preview;
