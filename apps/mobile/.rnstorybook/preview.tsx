import type { Preview } from "@storybook/react-native";
import { View } from "react-native";

const preview: Preview = {
	decorators: [
		(Story) => (
			<View className="flex-1 bg-background p-4">
				<Story />
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
