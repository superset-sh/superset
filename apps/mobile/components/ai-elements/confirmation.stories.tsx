import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import {
	Confirmation,
	ConfirmationAccepted,
	ConfirmationAction,
	ConfirmationActions,
	ConfirmationRejected,
	ConfirmationRequest,
	ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import { Text } from "@/components/ui/text";

const meta = {
	title: "ai-elements/Confirmation",
	component: Confirmation,
	args: {
		state: "approval-requested",
		approval: { id: "approval-1" },
	},
} satisfies Meta<typeof Confirmation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Pending: Story = {
	render: () => (
		<View className="w-full">
			<Confirmation approval={{ id: "approval-1" }} state="approval-requested">
				<ConfirmationTitle>
					The agent wants to run `bun run db:migrate`. Allow it?
				</ConfirmationTitle>
				<ConfirmationRequest>
					<ConfirmationActions>
						<ConfirmationAction variant="outline">
							<Text>Reject</Text>
						</ConfirmationAction>
						<ConfirmationAction>
							<Text>Approve</Text>
						</ConfirmationAction>
					</ConfirmationActions>
				</ConfirmationRequest>
			</Confirmation>
		</View>
	),
};

export const Accepted: Story = {
	render: () => (
		<View className="w-full">
			<Confirmation
				approval={{ approved: true, id: "approval-1" }}
				state="output-available"
			>
				<ConfirmationAccepted>
					<ConfirmationTitle>Approved — migration ran.</ConfirmationTitle>
				</ConfirmationAccepted>
			</Confirmation>
		</View>
	),
};

export const Rejected: Story = {
	render: () => (
		<View className="w-full">
			<Confirmation
				approval={{
					approved: false,
					id: "approval-1",
					reason: "Not on this branch",
				}}
				state="output-denied"
			>
				<ConfirmationRejected>
					<ConfirmationTitle>
						Rejected — the command was not run.
					</ConfirmationTitle>
				</ConfirmationRejected>
			</Confirmation>
		</View>
	),
};
