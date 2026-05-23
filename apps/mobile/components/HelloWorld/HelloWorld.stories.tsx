import type { Meta, StoryObj } from "@storybook/react-native";
import { HelloWorld } from "./HelloWorld";

const meta: Meta<typeof HelloWorld> = {
	title: "Components/HelloWorld",
	component: HelloWorld,
	args: {
		title: "Hello, Superset Mobile",
		subtitle: "First component verified against design tokens.",
		variant: "default",
		showIcon: false,
	},
	argTypes: {
		title: { control: "text" },
		subtitle: { control: "text" },
		variant: {
			control: { type: "select" },
			options: ["default", "primary", "destructive"],
		},
		showIcon: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof HelloWorld>;

export const Default: Story = {};

export const Primary: Story = {
	args: { variant: "primary" },
};

export const Destructive: Story = {
	args: {
		variant: "destructive",
		title: "Heads up",
		subtitle: "Destructive variant uses destructive tokens.",
	},
};

export const WithIcon: Story = {
	args: { showIcon: true },
};

export const TitleOnly: Story = {
	args: { subtitle: undefined, showIcon: true, variant: "primary" },
};
