import type { Meta, StoryObj } from "@storybook/react-native";
import { FadeIn, FadeOut } from "react-native-reanimated";
import { NativeOnlyAnimatedView } from "@/components/ui/native-only-animated-view";
import { Text } from "@/components/ui/text";

const meta = {
	title: "ui/NativeOnlyAnimatedView",
	component: NativeOnlyAnimatedView,
	render: () => (
		<NativeOnlyAnimatedView entering={FadeIn} exiting={FadeOut}>
			<Text className="bg-muted rounded-md px-4 py-3">
				I am only animated on native.
			</Text>
		</NativeOnlyAnimatedView>
	),
} satisfies Meta<typeof NativeOnlyAnimatedView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
