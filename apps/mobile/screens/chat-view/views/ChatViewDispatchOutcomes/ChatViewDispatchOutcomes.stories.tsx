import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { ChatViewDispatchOutcomes } from "./ChatViewDispatchOutcomes";

const meta: Meta<typeof ChatViewDispatchOutcomes> = {
	title: "Views/Chat/02-ChatView · Dispatch outcomes",
	component: ChatViewDispatchOutcomes,
	parameters: {
		docs: {
			description: {
				component:
					"UC-PLATF-03 §B — dispatch-outcome banner variants. The `stacked` story mirrors the design contact-sheet (unpaid + dispatch-failed stacked); individual stories isolate each variant.",
			},
		},
		layout: "fullscreen",
	},
	decorators: [
		(Story) => (
			<View className="flex-1 bg-background">
				<Story />
			</View>
		),
	],
	args: { variant: "stacked" },
	argTypes: {
		variant: {
			control: { type: "select" },
			options: [
				"stacked",
				"offline",
				"unpaid",
				"dispatch-failed",
				"permission-denied",
			],
		},
	},
};

export default meta;

type Story = StoryObj<typeof ChatViewDispatchOutcomes>;

export const Stacked: Story = {};
export const Unpaid: Story = { args: { variant: "unpaid" } };
export const DispatchFailed: Story = { args: { variant: "dispatch-failed" } };
export const PermissionDenied: Story = {
	args: { variant: "permission-denied" },
};
