import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { PlanReviewModal } from "./PlanReviewModal";

const meta: Meta<typeof PlanReviewModal> = {
	title: "Views/Chat/03-PlanReviewModal",
	component: PlanReviewModal,
	parameters: {
		docs: {
			description: {
				component:
					"UC-PAUSE-03 §A — full-screen plan review modal. The modal owns its chrome (ModalHeader + scrollable markdown + expandable feedback + docked Reject/Approve). Approve / Reject toggle a 1.2s isSubmitting state via useState so reviewers can see the spinner transition.",
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
	args: { onResolve: () => {}, onClose: () => {} },
};

export default meta;

type Story = StoryObj<typeof PlanReviewModal>;

export const Default: Story = {};
