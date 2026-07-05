import type { Meta, StoryObj } from "@storybook/react-native";
import { Alert, View } from "react-native";
import { ClickableFilePath } from "@/components/ai-elements/clickable-file-path";
import { Text } from "@/components/ui/text";

const PATH = "apps/mobile/components/ai-elements/clickable-file-path.tsx";

const handlePress = (path: string) => {
	Alert.alert("Open file", path);
};

const meta = {
	title: "ai-elements/ClickableFilePath",
	component: ClickableFilePath,
} satisfies Meta<typeof ClickableFilePath>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Pressable: Story = {
	args: {
		path: PATH,
		onPress: handlePress,
	},
};

export const Static: Story = {
	args: {
		path: PATH,
	},
};

export const FullPathDisplay: Story = {
	args: {
		path: PATH,
		display: PATH,
		onPress: handlePress,
	},
};

export const InlineInText: Story = {
	args: {
		path: PATH,
	},
	render: () => (
		<View className="w-full">
			<Text className="text-muted-foreground text-sm">
				Read{" "}
				<ClickableFilePath
					className="text-sm"
					onPress={handlePress}
					path={PATH}
				/>{" "}
				(142 lines)
			</Text>
		</View>
	),
};
