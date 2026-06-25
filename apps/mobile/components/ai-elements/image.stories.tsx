import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Image } from "@/components/ai-elements/image";

const CHECKER_PNG_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAH0lEQVR4nGNITvsIRHKa1kCEzGbAKYEpBGHjlqCDHQDa/UeBkkPfygAAAABJRU5ErkJggg==";

const meta = {
	title: "ai-elements/Image",
	component: Image,
} satisfies Meta<typeof Image>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		base64: CHECKER_PNG_BASE64,
		mediaType: "image/png",
		alt: "Generated checkerboard",
	},
	render: (args) => (
		<View className="w-full p-4">
			<Image {...args} />
		</View>
	),
};

export const FixedSize: Story = {
	args: {
		base64: CHECKER_PNG_BASE64,
		mediaType: "image/png",
		alt: "Generated checkerboard thumbnail",
	},
	render: (args) => (
		<View className="w-full flex-row gap-4 p-4">
			<Image {...args} className="size-16 rounded-lg" />
			<Image {...args} className="size-24 rounded-xl" />
			<Image {...args} className="size-32 rounded-2xl" />
		</View>
	),
};
