import type { Meta, StoryObj } from "@storybook/react-native";
import { ScrollView, View } from "react-native";
import { SuggestedAnswerPill } from "./SuggestedAnswerPill";

const meta: Meta<typeof SuggestedAnswerPill> = {
	title: "Molecules/SuggestedAnswerPill",
	component: SuggestedAnswerPill,
	parameters: {
		docs: {
			description: {
				component:
					"Tappable pill in the ask_user bottom sheet's suggested-answers horizontal row. 3 variants — default (neutral) · accent (recommended ember) · ghost (subtle). 44pt touch zone via Pill md. Composes first-party Pill.",
			},
		},
		layout: "centered",
	},
	args: {
		text: "tRPC",
		variant: "default",
		disabled: false,
	},
	argTypes: {
		text: { control: "text" },
		variant: {
			control: { type: "select" },
			options: ["default", "accent", "ghost"],
		},
		disabled: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof SuggestedAnswerPill>;

export const Default: Story = {};

export const Accent: Story = {
	args: { variant: "accent", text: "Yes, retry connection" },
};

export const Ghost: Story = {
	args: { variant: "ghost", text: "Maybe later" },
};

export const HorizontalScrollRow: Story = {
	render: () => (
		<View className="max-w-sm w-full">
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerClassName="px-3 py-2 gap-2"
			>
				<SuggestedAnswerPill text="tRPC" variant="accent" />
				<SuggestedAnswerPill text="REST" />
				<SuggestedAnswerPill text="GraphQL" />
				<SuggestedAnswerPill text="gRPC" />
				<SuggestedAnswerPill text="Let me think more…" variant="ghost" />
			</ScrollView>
		</View>
	),
};
