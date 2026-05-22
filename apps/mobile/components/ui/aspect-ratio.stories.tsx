import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Text } from "@/components/ui/text";

function AspectRatioShowcase({ ratio }: { ratio: number }) {
	return (
		<View className="w-full max-w-sm">
			<AspectRatio ratio={ratio}>
				<View className="bg-secondary border-border h-full w-full items-center justify-center rounded-md border">
					<Text variant="small" className="text-muted-foreground">
						{ratio.toFixed(3)} ratio
					</Text>
				</View>
			</AspectRatio>
		</View>
	);
}

const meta: Meta<typeof AspectRatioShowcase> = {
	title: "Components/AspectRatio",
	component: AspectRatioShowcase,
	parameters: {
		docs: {
			description: {
				component:
					"Constrain a container to a fixed width:height ratio. Used for image placeholders, banners, and any layout that needs a stable proportional box.",
			},
		},
	},
	args: { ratio: 16 / 9 },
	argTypes: {
		ratio: {
			control: { type: "select" },
			options: [16 / 9, 4 / 3, 1, 3 / 4, 9 / 16],
		},
	},
};

export default meta;

type Story = StoryObj<typeof AspectRatioShowcase>;

export const Widescreen: Story = { args: { ratio: 16 / 9 } };
export const Standard: Story = { args: { ratio: 4 / 3 } };
export const Square: Story = { args: { ratio: 1 } };
export const Portrait: Story = { args: { ratio: 3 / 4 } };
